import { generateObject } from "ai"
import { z } from "zod"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserWorkspaceId, withWorkspace } from "@/lib/workspace"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * 아이디어 지도(뇌구조) — 회의노트 대개편 P4. 창고의 아이디어 전체를 하나의 연결망으로 본다.
 * 리서치 그래프(research/graph)와 같은 스키마를 쓰므로 클라이언트는 ResearchGraph 컴포넌트를 재사용한다.
 *
 * GET  = 캐시된 지도 조회(토큰 0). POST = 재생성(명시적 새로고침일 때만 — 자동 재생성 금지, 토큰 효율).
 * 지도는 워크스페이스당 1행(idea_graphs)에 저장한다.
 */

const GraphSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().describe("짧은 식별자(영문/숫자)"),
        label: z.string().describe("노드 이름(한국어, 짧게)"),
        group: z.string().describe("유형 — 색 구분용 (예: 주제·제품·채널·비용·고객)"),
      }),
    )
    .max(40),
  links: z
    .array(
      z.object({
        source: z.string().describe("노드 id"),
        target: z.string().describe("노드 id"),
        rel: z.string().optional().describe("관계 라벨(짧게, 선택)"),
      }),
    )
    .max(80),
})

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })
  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  if (!workspaceId) return new Response("Forbidden", { status: 403 })

  const { data } = await supabase
    .from("idea_graphs")
    .select("graph, idea_count, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle()
  return Response.json({ graph: data?.graph ?? null, ideaCount: data?.idea_count ?? 0, updatedAt: data?.updated_at ?? null })
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const budget = await checkBudget(user.id, "interactive")
  if (!budget.ok) return new Response(budget.message ?? BUDGET_EXCEEDED_MSG, { status: 429 })

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  if (!workspaceId) return new Response("Forbidden", { status: 403 })

  // 코퍼스 = 아이디어 제목·메모·태그·상태 (RLS로 워크스페이스 격리)
  const { data: ideas } = await supabase
    .from("ideas")
    .select("title, body, tags, status")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(120)

  if (!ideas || ideas.length < 2) {
    return Response.json({ graph: null, ideaCount: ideas?.length ?? 0, reason: "아이디어가 2개 이상이면 지도를 그릴 수 있어요." })
  }

  const material = ideas
    .map((i, n) => `${n + 1}. [${i.status}] ${i.title}${i.body ? ` — ${i.body.slice(0, 200)}` : ""}${(i.tags ?? []).length ? ` (태그: ${(i.tags ?? []).join(", ")})` : ""}`)
    .join("\n")
    .slice(0, 12000)

  const started = Date.now()
  const result = await generateObject({
    model: anthropic(MODELS.default),
    schema: GraphSchema,
    system: `너는 팀이 모아 둔 업무 아이디어들을 하나의 지식 지도로 구조화한다.
- 개별 아이디어를 그대로 노드로 넣지 말고, **아이디어를 관통하는 주제·대상·수단**을 노드로 뽑아 서로 연결한다.
- 서로 떨어져 있던 아이디어를 잇는 연결(공통 고객·공통 비용요인·같은 채널 등)을 우선 드러낸다 — 이 지도의 목적은 재발견이다.
- 노드 8~25개, group은 소수 유형으로 일관되게. 근거 없는 관계를 지어내지 마라.`,
    prompt: `팀의 아이디어 목록:\n${material}`,
    maxOutputTokens: 2000,
    temperature: 0.3,
  })

  // dangling 링크 정리 — source/target이 실제 노드일 때만
  const ids = new Set(result.object.nodes.map((n) => n.id))
  const links = result.object.links.filter((l) => ids.has(l.source) && ids.has(l.target) && l.source !== l.target)
  const graph = { nodes: result.object.nodes, links }

  await supabase.from("idea_graphs").upsert(
    {
      workspace_id: workspaceId,
      graph,
      idea_count: ideas.length,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: "workspace_id" },
  )

  try {
    const admin = createAdminClient()
    await admin.from("agent_usage").insert(
      withWorkspace(
        {
          user_id: user.id,
          tokens_input: result.usage.inputTokens ?? 0,
          tokens_output: result.usage.outputTokens ?? 0,
          duration_ms: Date.now() - started,
          success: true,
          model: MODELS.default,
          cost_usd: computeCostUsd(MODELS.default, result.usage.inputTokens ?? 0, result.usage.outputTokens ?? 0),
        },
        workspaceId,
      ),
    )
  } catch {
    /* 비용 기록 실패 무시 */
  }

  return Response.json({ graph, ideaCount: ideas.length, updatedAt: new Date().toISOString() })
}
