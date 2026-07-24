// 에이전트 제작 되물음 인터뷰 — 위저드 입력을 읽고, 정확도를 높이려 채워야 할 "빈틈"을 겨냥한 질문 2~4개 생성.
// "AI는 정확한 기획이 바탕이 되어야 정확도가 오른다"(대표) → 생성 직전에 부족한 스펙을 능동적으로 되묻는다.
// 전략문서 §4 "[1] 온보딩 인터뷰"의 첫 실체. 읽기 전용(DB 쓰기 없음, agent_usage만 기록).
import { generateObject } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { interviewSchema } from "@/lib/claude/schemas"
import { createClient } from "@/lib/supabase/server"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"
import { getUserWorkspaceId, withWorkspace } from "@/lib/workspace"
import { serializeInputs, type WizardInputs } from "@/lib/agentBuilder"

export const runtime = "nodejs"
export const maxDuration = 30

const SYSTEM =
  `당신은 시니어 프롬프트 엔지니어입니다. 사용자가 만들려는 에이전트의 입력을 보고, ` +
  `"이대로 만들면 정확도가 떨어질 빈틈"을 찾아 사용자에게 되물을 질문을 만듭니다.\n\n` +
  `우선순위(빈틈이 있을 때만 질문):\n` +
  `1. 실제 예시(입력→기대출력)가 없으면 → 대표 사례 하나를 요청.\n` +
  `2. 성공 기준이 모호하면 → 측정 가능한 합격선을 요청.\n` +
  `3. 처리 범위·예외(엣지케이스)가 불명확하면 → 어디까지 하고 어디서 멈출지 확인.\n` +
  `4. 이 회사·업무 고유의 규칙/금지선이 안 보이면 → 반드시 지켜야 할 규칙을 유도.\n\n` +
  `규칙: 질문은 2~4개, 짧고 구체적으로, 사용자가 실제로 아는 것만 묻습니다. ` +
  `이미 충분히 구체적이면 억지로 만들지 말고 빈 배열을 반환합니다. 한국어로.`

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const budget = await checkBudget(user.id)
  if (!budget.ok) return new Response(BUDGET_EXCEEDED_MSG, { status: 429 })

  const body = (await req.json().catch(() => null)) as { inputs?: WizardInputs } | null
  const inputs = body?.inputs
  if (!inputs || typeof inputs !== "object") {
    return new Response("Bad Request", { status: 400 })
  }

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  const startedAt = Date.now()
  try {
    const result = await generateObject({
      model: anthropic(MODELS.default),
      schema: interviewSchema,
      system: SYSTEM,
      prompt: `다음은 사용자가 만들려는 에이전트의 입력입니다. 정확도를 높이려 채워야 할 빈틈을 겨냥해 질문하세요.\n\n${serializeInputs(inputs)}`,
      temperature: 0.4,
    })
    const inT = result.usage.inputTokens ?? 0
    const outT = result.usage.outputTokens ?? 0
    await supabase.from("agent_usage").insert(
      withWorkspace(
        {
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
    // 최대 4개로 방어(모델이 넘겨도).
    return Response.json({ questions: result.object.questions.slice(0, 4) })
  } catch (e) {
    await supabase.from("agent_usage").insert(
      withWorkspace(
        {
          user_id: user.id,
          duration_ms: Date.now() - startedAt,
          success: false,
          error_message: e instanceof Error ? e.message : String(e),
          model: MODELS.default,
        },
        workspaceId,
      ),
    )
    // 실패 시 질문 없이 진행(품질만 낮아질 뿐, 제작을 막지 않음).
    return Response.json({ questions: [] })
  }
}
