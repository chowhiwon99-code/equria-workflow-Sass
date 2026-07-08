import { generateText } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * 리서치 자료로 보고서/기획서 초안 작성 (Part 2 · 2c).
 * 모은 자료(material) 범위 안에서만 작성 — 자료에 없는 사실은 지어내지 않게 강제(검증 라우트가 후속 점검).
 */
const STRUCT: Record<string, string> = {
  report: `보고서 형식:
# (제목)
## 요약
## 배경
## 핵심 내용 (필요한 만큼 ## 소제목)
## 결론·시사점`,
  proposal: `기획서 형식:
# (제목)
## 배경·문제
## 목표
## 제안 내용
## 실행 방안
## 기대 효과
## 리스크·고려사항`,
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const budget = await checkBudget(user.id)
  if (!budget.ok) return new Response(BUDGET_EXCEEDED_MSG, { status: 429 })

  const body = (await req.json().catch(() => null)) as { topic?: unknown; material?: unknown; type?: unknown } | null
  const topic = typeof body?.topic === "string" ? body.topic.trim().slice(0, 2000) : ""
  const material = typeof body?.material === "string" ? body.material.slice(0, 12000) : ""
  const type = body?.type === "proposal" ? "proposal" : "report"
  if (!material) return new Response("Bad Request", { status: 400 })

  const system = `너는 회의·기획용 문서 작성 어시스턴트다. 아래 "리서치 자료"만 근거로 한국어 ${type === "proposal" ? "기획서" : "보고서"} 초안을 마크다운으로 작성한다.

규칙:
- 자료에 없는 사실·숫자는 지어내지 마라. 부족하면 "추가 조사 필요"로 표시.
- 자료의 신뢰도 표기를 존중하고, 불확실은 단정하지 마라.
- 간결하고 실무적으로. 불릿을 적극 활용.

${STRUCT[type]}`

  const started = Date.now()
  const result = await generateText({
    model: anthropic(MODELS.default),
    system,
    prompt: `주제: ${topic}\n\n리서치 자료:\n${material}`,
    maxOutputTokens: 3000,
    temperature: 0.5,
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

  return Response.json({ draft: result.text })
}
