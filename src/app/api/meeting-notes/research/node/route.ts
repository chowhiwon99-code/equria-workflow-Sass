import { generateObject } from "ai"
import { z } from "zod"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { computeCostUsd } from "@/lib/pricing"

export const runtime = "nodejs"
export const maxDuration = 45

/**
 * 그래프 노드 탐색(꼬리물기) (Part 2 · 그래프) — 노드를 클릭/칩 선택하면 설명 + 다음 꼬리질문
 * + 연관 노드를 반환. 망이 자라고(newNodes/newLinks) 카드가 깊어진다(explanation/followups).
 */
const NodeSchema = z.object({
  explanation: z.string().describe("이 개념이 무엇인지 리서치 맥락에서 1~3문장 쉬운 설명"),
  followups: z.array(z.string()).max(4).describe("더 파고들 꼬리질문 3~4개(짧게)"),
  related: z
    .array(z.object({ label: z.string().describe("연관 개념 이름"), rel: z.string().optional().describe("관계(짧게)") }))
    .max(5)
    .describe("이 개념과 연결되는 새 개념 3~5개 — 그래프에 노드로 추가됨"),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as { topic?: unknown; node?: unknown; question?: unknown; context?: unknown } | null
  const topic = typeof body?.topic === "string" ? body.topic.trim().slice(0, 500) : ""
  const node = typeof body?.node === "string" ? body.node.trim().slice(0, 200) : ""
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 300) : ""
  const context = typeof body?.context === "string" ? body.context.slice(0, 6000) : ""
  if (!node) return new Response("Bad Request", { status: 400 })

  const started = Date.now()
  const result = await generateObject({
    model: anthropic(MODELS.default),
    schema: NodeSchema,
    system: `너는 리서치 그래프의 탐색 가이드다. 사용자가 노드를 클릭하면 그 개념을 쉽게 설명하고, 더 파고들 꼬리질문과 연관 개념을 제시한다.
- 리서치 주제·자료 맥락 안에서 답하라. 자료에 없으면 일반 지식으로 보완하되 단정하지 마라.
- 설명은 비전문가도 이해하게 쉽고 짧게.
- related(연관 개념)는 이 노드에서 가지를 칠 새 노드다 — 주제와 실제로 연결되는 것만.`,
    prompt: `리서치 주제: ${topic}\n클릭한 개념: ${node}${question ? `\n사용자가 더 알고 싶은 것: ${question}` : ""}\n\n리서치 자료(맥락):\n${context}`,
    maxOutputTokens: 1200,
    temperature: 0.45,
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
