import { NextResponse } from "next/server"
import { generateObject } from "ai"
import { createClient } from "@/lib/supabase/server"
import { anthropic, MODELS } from "@/lib/claude/client"
import { cashCoachSchema } from "@/lib/claude/schemas"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"
import { buildCoachPrompt, type CoachPayload } from "@/lib/cashCoach"

export const runtime = "nodejs"
export const maxDuration = 60

const SYSTEM = `당신은 한국 중소기업의 현금흐름·손익(P&L)을 분석하는 재무 코치입니다.
주어진 현재 스냅샷 데이터만 근거로 분석합니다. 데이터에 없는 사실을 지어내지 마세요.

원칙:
- 모든 지적·제안에는 데이터의 실제 금액이나 비율 근거를 반드시 포함합니다.
- 일반론(예: "비용을 아끼세요")은 금지. 특정 항목·숫자를 짚어 구체적으로.
- 근거가 없으면 항목을 만들지 말고 빈 배열로 두세요. 억지로 채우지 않습니다.
- 재무가 건강하면 health.level=good 으로 솔직히 알리고 배열을 비웁니다.
- 통화는 데이터에 주어진 통화로 유지하고, 통화가 여럿이면 섞어 합산하지 마세요.
- 한국어로, 간결하고 실행 가능하게. 각 detail은 1~2문장.

살펴볼 신호(해당할 때만):
- 비용 > 매출 이거나 순이익/가용현금이 마이너스
- 특정 비용 항목이 전체 비용의 큰 비중(예: 40% 이상)
- 순이익률이 낮음(예: 한 자릿수)
- 시작 보유현금 대비 가용현금 급감, 보유(적립) 대비 비용 과다
- 매출이 소수 항목에 집중, 통화 편중

추세(trends) — "실제 회계 내역(장부) 기준 최근 월별 추세" 블록이 있을 때만 채웁니다:
- 매출·비용·순이익의 연속 증가/감소(예: 3개월 연속 감소) 또는 전월대비 급변(큰 폭 증감).
- 이 추세는 실제 장부 실적이며 위 손익 모델 스냅샷과 별개입니다. 두 값을 억지로 일치시키거나 합산하지 마세요.
- 근거가 되는 월별 수치나 변화율을 detail에 반드시 포함. 추세 블록이 없으면 trends는 빈 배열.`

/**
 * 현금흐름 AI 코칭 — 현재 손익 스냅샷을 Claude가 분석해 건강도·절감 제안·이상 신호를 구조화 반환.
 * 읽기 전용(DB 쓰기 없음). Body: { payload: CoachPayload }.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const budget = await checkBudget(user.id)
  if (!budget.ok) return NextResponse.json({ error: BUDGET_EXCEEDED_MSG }, { status: 429 })

  const body = (await req.json().catch(() => null)) as { payload?: CoachPayload } | null
  const payload = body?.payload
  if (!payload || !Array.isArray(payload.slots) || !Array.isArray(payload.summaries)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }
  if (payload.slots.length === 0) {
    return NextResponse.json({ error: "분석할 항목이 없어요." }, { status: 400 })
  }

  const startedAt = Date.now()
  try {
    const result = await generateObject({
      model: anthropic(MODELS.default),
      schema: cashCoachSchema,
      system: SYSTEM,
      prompt: buildCoachPrompt(payload),
      temperature: 0.3,
    })
    const inT = result.usage.inputTokens ?? 0
    const outT = result.usage.outputTokens ?? 0
    await supabase.from("agent_usage").insert({
      user_id: user.id,
      tokens_input: inT,
      tokens_output: outT,
      duration_ms: Date.now() - startedAt,
      success: true,
      model: MODELS.default,
      cost_usd: computeCostUsd(MODELS.default, inT, outT),
    })
    return NextResponse.json({ result: result.object })
  } catch (e) {
    // 실패 사용량 기록(관측성) — 어시스턴트 라우트와 동일 패턴.
    await supabase.from("agent_usage").insert({
      user_id: user.id,
      duration_ms: Date.now() - startedAt,
      success: false,
      error_message: e instanceof Error ? e.message : String(e),
      model: MODELS.default,
    })
    return NextResponse.json({ error: "코칭 분석에 실패했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 })
  }
}
