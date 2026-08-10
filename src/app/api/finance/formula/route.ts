import { NextResponse } from "next/server"
import { generateObject } from "ai"
import { createClient } from "@/lib/supabase/server"
import { anthropic, MODELS } from "@/lib/claude/client"
import { formulaConvertSchema } from "@/lib/claude/schemas"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"
import { getUserWorkspaceId, withWorkspace } from "@/lib/workspace"
import { parseFormulaText } from "@/lib/formulaParse"

export const runtime = "nodejs"
export const maxDuration = 30

const SYSTEM = `한국어 자연어 설명을 계산 수식 한 줄로 변환합니다. 수식만 만들고 설명하지 마세요.

규칙:
- 칸 이름은 짧은 한국어 명사(띄어쓰기 없이): 월급여, 판매수, 단가, 수수료
- 비율 칸은 이름 뒤에 %: 수수료% · 고정 비율 숫자는 3.3%처럼 숫자에 %
- 연산자는 + − × ÷ ( ) 만. 등호·설명·단위(원) 금지.
- 사용자가 언급한 값만 사용. 임의 항목 추가 금지.

예:
- "월급에서 3.3프로 떼줘" → 월급 × 3.3%
- "판매수 곱하기 단가에서 수수료 10.8% 빼고 택배비 3천원씩 빼줘" → 판매수 × (단가 × (1 − 10.8%) − 3000)
- "기본급에 매출의 5%를 인센티브로 얹어줘" → 기본급 + 매출 × 5%`

/** 자연어 → 수식 텍스트(AI 폴백) — 파서 실패 시에만 클라가 호출. 결과도 파서로 재검증(AI는 텍스트만 제안). */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const budget = await checkBudget(user.id, "interactive")
  if (!budget.ok) return NextResponse.json({ error: budget.message ?? BUDGET_EXCEEDED_MSG }, { status: 429 })

  const body = (await req.json().catch(() => null)) as { text?: string } | null
  const text = body?.text?.trim()
  if (!text || text.length > 300) return NextResponse.json({ error: "변환할 문장을 입력하세요(300자 이내)." }, { status: 400 })

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  const startedAt = Date.now()
  try {
    const result = await generateObject({
      model: anthropic(MODELS.cheap), // 원샷 소작업 — Haiku(토큰 우려로 파서 우선, AI는 폴백)
      schema: formulaConvertSchema,
      system: SYSTEM,
      prompt: text,
      temperature: 0,
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
          model: MODELS.cheap,
          cost_usd: computeCostUsd(MODELS.cheap, inT, outT),
        },
        workspaceId,
      ),
    )
    // AI 산출물은 제안일 뿐 — 파서가 최종 게이트(못 읽으면 실패로 응답).
    const formula = result.object.formula.trim()
    const parsed = parseFormulaText(formula)
    if (!parsed.ok) return NextResponse.json({ error: "수식으로 바꾸지 못했어요. 조금 더 구체적으로 적어주세요." }, { status: 422 })
    return NextResponse.json({ formula })
  } catch {
    await supabase.from("agent_usage").insert(
      withWorkspace(
        { user_id: user.id, duration_ms: Date.now() - startedAt, success: false, model: MODELS.cheap, cost_usd: 0 },
        workspaceId,
      ),
    )
    return NextResponse.json({ error: "변환에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 500 })
  }
}
