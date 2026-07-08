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
 * 리서치 지식 그래프 추출 (Part 2 · 그래프) — 자료에서 핵심 개체·관계를 노드/엣지로.
 * 클라이언트(d3-force 캔버스)가 움직이는 망으로 렌더. dangling 링크는 서버에서 정리.
 */
const GraphSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().describe("짧은 식별자(영문/숫자)"),
        label: z.string().describe("노드 이름(한국어)"),
        group: z.string().describe("유형 — 색 구분용 (예: 주제·개념·트렌드·기업·출처)"),
      })
    )
    .max(40),
  links: z
    .array(
      z.object({
        source: z.string().describe("노드 id"),
        target: z.string().describe("노드 id"),
        rel: z.string().optional().describe("관계 라벨(짧게, 선택)"),
      })
    )
    .max(80),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const budget = await checkBudget(user.id)
  if (!budget.ok) return new Response(BUDGET_EXCEEDED_MSG, { status: 429 })

  const body = (await req.json().catch(() => null)) as { topic?: unknown; material?: unknown } | null
  const topic = typeof body?.topic === "string" ? body.topic.trim().slice(0, 2000) : ""
  const material = typeof body?.material === "string" ? body.material.slice(0, 12000) : ""
  if (!material) return new Response("Bad Request", { status: 400 })

  const started = Date.now()
  const result = await generateObject({
    model: anthropic(MODELS.default),
    schema: GraphSchema,
    system: `너는 리서치 자료를 지식 그래프로 구조화한다. 핵심 개체(주제·개념·트렌드·기업·출처 등)를 노드로, 의미 있는 관계를 엣지로 뽑는다.
- 중심 주제를 허브로 두고 방사형으로 연결.
- 노드 8~25개, 관계는 실제 자료에 근거한 것만. 군더더기·중복 금지.
- group은 색 구분용 유형명(소수 종류로 일관되게).
- 자료에 없는 관계를 지어내지 마라.`,
    prompt: `주제: ${topic}\n\n리서치 자료:\n${material}`,
    maxOutputTokens: 2000,
    temperature: 0.3,
  })

  // dangling 링크 정리 — source/target가 실제 노드일 때만
  const ids = new Set(result.object.nodes.map((n) => n.id))
  const links = result.object.links.filter((l) => ids.has(l.source) && ids.has(l.target) && l.source !== l.target)

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

  return Response.json({ nodes: result.object.nodes, links })
}
