import { generateObject } from "ai"
import { z } from "zod"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * 초안 검증 (Part 2 · 2c) — 적대적 팩트체크. 초안의 핵심 주장이 리서치 자료로 뒷받침되는지 판정.
 * 기본을 의심으로 두고 근거가 약하면 weak/unsupported. 미검증을 supported로 통과시키지 않게 강제.
 */
const VerifySchema = z.object({
  overall: z.string().describe("전체 평가 한두 문장 — 초안이 자료에 얼마나 충실한지"),
  items: z
    .array(
      z.object({
        claim: z.string().describe("초안의 핵심 주장(짧게)"),
        verdict: z.enum(["supported", "weak", "unsupported"]).describe("자료 근거 정도"),
        note: z.string().describe("판단 근거·보완점 (한 문장)"),
      })
    )
    .describe("핵심 주장별 검증 (최대 12개)"),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const budget = await checkBudget(user.id)
  if (!budget.ok) return new Response(BUDGET_EXCEEDED_MSG, { status: 429 })

  const body = (await req.json().catch(() => null)) as { draft?: unknown; material?: unknown } | null
  const draft = typeof body?.draft === "string" ? body.draft.slice(0, 12000) : ""
  const material = typeof body?.material === "string" ? body.material.slice(0, 12000) : ""
  if (!draft || !material) return new Response("Bad Request", { status: 400 })

  const started = Date.now()
  const result = await generateObject({
    model: anthropic(MODELS.default),
    schema: VerifySchema,
    system: `너는 깐깐한 검증자다. "초안"의 핵심 주장들이 "리서치 자료"로 뒷받침되는지 적대적으로 점검한다.
- supported = 자료가 명확히 뒷받침 / weak = 부분적·간접적·신뢰도 낮음 / unsupported = 자료에 근거 없음·과장·추측.
- 기본을 의심으로 두고, 근거가 약하면 weak/unsupported로 분류하라. 미검증을 supported로 통과시키지 마라.`,
    prompt: `초안:\n${draft}\n\n리서치 자료(근거):\n${material}`,
    maxOutputTokens: 2000,
    temperature: 0.2,
  })

  try {
    const admin = createAdminClient()
    await admin.from("agent_usage").insert({
      user_id: user.id,
      tokens_input: result.usage.inputTokens ?? 0,
      tokens_output: result.usage.outputTokens ?? 0,
      duration_ms: Date.now() - started,
      success: true,
      model: MODELS.default,
      cost_usd: computeCostUsd(MODELS.default, result.usage.inputTokens ?? 0, result.usage.outputTokens ?? 0),
    })
  } catch {
    /* 비용 기록 실패 무시 */
  }

  return Response.json(result.object)
}
