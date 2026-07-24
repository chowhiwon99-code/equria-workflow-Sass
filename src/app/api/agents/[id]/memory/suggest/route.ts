// 채팅 답변 → 저장할 기억 한 줄 제안(원클릭 '기억하기'의 1단계).
// 사용자가 좋은 답변에 '기억하기'를 누르면, 그 답변에서 오래 쓸 한 줄을 뽑아 미리채운다(확인·수정 후 저장).
// 저장 자체는 기존 POST /api/agents/[id]/memory 가 담당. 여기선 "제안"만(DB 쓰기 없음, agent_usage만 기록).
import { generateObject } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { memorySuggestSchema } from "@/lib/claude/schemas"
import { createClient } from "@/lib/supabase/server"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"
import { getUserWorkspaceId, withWorkspace } from "@/lib/workspace"

export const runtime = "nodejs"
export const maxDuration = 30

const SYSTEM =
  `당신은 대화 답변에서 "이 사용자가 앞으로도 계속 쓰고 싶어할 한 가지"를 골라 한 문장으로 압축하는 추출기입니다.\n` +
  `답변 전체를 옮기지 마세요. 오래 유효하고 이 사용자 고유의 선호·사실·말투·교정 중 가장 핵심 하나만 한 줄로.\n` +
  `명령문('~해줘'·'기억해')이나 일회성 작업지시가 아니라, 앞으로도 통하는 규칙·선호로 바꿔 쓰세요.\n` +
  `예: 답변이 표로 잘 정리돼 좋았다면 content="보고서는 표로 정리", kind="preference".`

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const budget = await checkBudget(user.id)
  if (!budget.ok) return new Response(BUDGET_EXCEEDED_MSG, { status: 429 })

  const body = (await req.json().catch(() => null)) as { text?: string } | null
  const text = body?.text?.trim()
  if (!text) return new Response("text required", { status: 400 })

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  const startedAt = Date.now()
  try {
    const result = await generateObject({
      model: anthropic(MODELS.cheap),
      schema: memorySuggestSchema,
      system: SYSTEM,
      prompt: `다음 답변에서 오래 기억할 한 줄을 뽑으세요.\n\n${text.slice(0, 4000)}`,
      temperature: 0,
    })
    const inT = result.usage.inputTokens ?? 0
    const outT = result.usage.outputTokens ?? 0
    await supabase.from("agent_usage").insert(
      withWorkspace(
        {
          agent_id: agentId,
          user_id: user.id,
          tokens_input: inT,
          tokens_output: outT,
          duration_ms: Date.now() - startedAt,
          success: true,
          model: MODELS.cheap,
          cost_usd: computeCostUsd(MODELS.cheap, inT, outT),
        },
        workspaceId,
      ),
    )
    return Response.json({ kind: result.object.kind, content: result.object.content })
  } catch (e) {
    await supabase.from("agent_usage").insert(
      withWorkspace(
        {
          agent_id: agentId,
          user_id: user.id,
          duration_ms: Date.now() - startedAt,
          success: false,
          error_message: e instanceof Error ? e.message : String(e),
          model: MODELS.cheap,
        },
        workspaceId,
      ),
    )
    // 폴백: 추출 실패해도 사용자가 직접 다듬어 저장할 수 있게 앞부분을 초안으로 준다.
    return Response.json({ kind: "preference", content: text.slice(0, 120) })
  }
}
