// 기억 정리(AI) — 미리보기(읽기 전용). 현재 활성 기억 전체를 AI가 병합·중복제거·쓰레기제거·재분류·
// 우선순위 매김한 "정리된 최종 목록"을 제안한다. DB는 안 바꾼다(적용은 organize/apply). 사용자가 before→after 확인 후 적용.
import { generateObject } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { memoryOrganizeSchema } from "@/lib/claude/schemas"
import { createClient } from "@/lib/supabase/server"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"
import { getUserWorkspaceId, withWorkspace } from "@/lib/workspace"
import { MEMORY_KIND_LABEL, type AgentMemoryKind } from "@/lib/agentMemory"

export const runtime = "nodejs"
export const maxDuration = 30

const SYSTEM =
  `당신은 사용자의 "에이전트 기억" 목록을 깔끔하게 정리하는 편집자입니다. 아래 원칙으로 정리된 최종 목록을 만드세요.\n` +
  `- 중복·유사한 기억은 하나로 병합해 더 명확한 한 문장으로.\n` +
  `- 기억이 아닌 것은 제거: 명령문('~해줘'·'기억해'·'방금 작업 기억해'), 일회성 작업지시, 맥락 없는 조각.\n` +
  `- 종류(사실·선호·말투·교정)를 알맞게 재분류.\n` +
  `- 중요도 매김: 자주 지켜야 할 핵심 규칙=3, 보통=2, 사소=1.\n` +
  `- 원래 뜻을 지어내 바꾸지 말고, 있는 내용을 정리만. 남길 게 없으면 빈 배열.`

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const budget = await checkBudget(user.id)
  if (!budget.ok) return new Response(BUDGET_EXCEEDED_MSG, { status: 429 })

  // 현재 활성 기억(본인 것만·RLS).
  const { data: current } = await supabase
    .from("agent_memories")
    .select("id, kind, content, importance, created_at")
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
  const currentList = current ?? []
  if (currentList.length === 0) {
    return Response.json({ current: [], proposed: [] })
  }

  const listText = currentList
    .map((m) => `- (${MEMORY_KIND_LABEL[m.kind as AgentMemoryKind] ?? "메모"}·중요도${m.importance}) ${m.content}`)
    .join("\n")

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  const startedAt = Date.now()
  try {
    const result = await generateObject({
      model: anthropic(MODELS.default),
      schema: memoryOrganizeSchema,
      system: SYSTEM,
      prompt: `다음은 현재 기억 목록입니다. 정리된 최종 목록을 만드세요.\n\n${listText}`,
      temperature: 0.2,
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
          model: MODELS.default,
          cost_usd: computeCostUsd(MODELS.default, inT, outT),
        },
        workspaceId,
      ),
    )
    // importance는 1~3으로 클램프(모델 방어).
    const proposed = result.object.memories.map((m) => ({
      kind: m.kind,
      content: m.content.trim(),
      importance: Math.min(3, Math.max(1, Math.round(m.importance || 2))),
    }))
    return Response.json({
      current: currentList.map((m) => ({ id: m.id, kind: m.kind, content: m.content, importance: m.importance })),
      proposed,
    })
  } catch (e) {
    await supabase.from("agent_usage").insert(
      withWorkspace(
        {
          agent_id: agentId,
          user_id: user.id,
          duration_ms: Date.now() - startedAt,
          success: false,
          error_message: e instanceof Error ? e.message : String(e),
          model: MODELS.default,
        },
        workspaceId,
      ),
    )
    return new Response("정리에 실패했어요. 잠시 후 다시 시도해 주세요.", { status: 502 })
  }
}
