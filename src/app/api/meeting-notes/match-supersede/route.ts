import { generateObject } from "ai"
import { z } from "zod"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { recordAiUsage } from "@/lib/aiUsage"
import { getUserWorkspaceId } from "@/lib/workspace"
import { checkBudget } from "@/lib/budget"

export const maxDuration = 30
export const runtime = "nodejs"

/**
 * 번복 후보 판정 — 결정 인프라 Unit A(D2). 새로 승인된 결정이 **과거 결정을 뒤집는지** 본다.
 * 이 기능이 원장의 존재 이유다: 원장만 있으면 "AI가 대신 써주는 ADR"이라 아무도 안 읽지만,
 * "이 결정 아직 유효한가"에 답할 수 있으면 읽을 이유가 생긴다.
 *
 * 2단계 게이트로 비용을 거의 0으로 만든다:
 *   1단계 SQL(0원) — search_decisions RPC가 trgm + topic 두 채널로 후보를 좁힌다.
 *   2단계 AI — **후보가 있을 때만** Haiku 1회. 없으면 AI를 아예 호출하지 않는다.
 *
 * 🔴 자동으로 링크하지 않는다. 사람이 "네"를 눌러야 link_decision_supersede RPC가 돈다.
 *    오탐을 자동 기록하면 결정 온도계가 거짓말을 하고, 그 순간 이 제품은 죽는다.
 */

const schema = z.object({
  candidate_id: z.string().nullable().describe("가장 유력한 과거 결정의 id. 관련 없으면 null"),
  relation: z
    .enum(["replaces", "refines", "contradicts", "unrelated"])
    .describe("replaces=대체, refines=구체화(원 결정 유지), contradicts=상충, unrelated=무관"),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(120).describe("한 줄 근거(사용자에게 보여줄 문구)"),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  if (!workspaceId) return new Response("Forbidden", { status: 403 })

  const body = (await req.json().catch(() => null)) as
    | { statement?: unknown; topics?: unknown; excludeNoteId?: unknown; dismissed?: unknown }
    | null
  const statement = typeof body?.statement === "string" ? body.statement.trim().slice(0, 300) : ""
  const topics = Array.isArray(body?.topics) ? body.topics.filter((t): t is string => typeof t === "string").slice(0, 4) : []
  const excludeNoteId = typeof body?.excludeNoteId === "string" ? body.excludeNoteId : null
  const dismissed = Array.isArray(body?.dismissed) ? body.dismissed.filter((d): d is string => typeof d === "string") : []
  if (!statement) return new Response("Bad Request", { status: 400 })

  // 1단계: SQL 후보 좁히기(0원). RLS가 워크스페이스 격리를 강제한다.
  // p_before는 기본값(null)을 쓰므로 넘기지 않는다 — 생성 타입이 optional string이라 null을 못 받는다.
  const { data: rows } = await supabase.rpc("search_decisions", {
    p_workspace: workspaceId,
    p_q: statement,
    p_topics: topics,
    p_kind: "decision",
    p_status: "active",
    ...(excludeNoteId ? { p_exclude_note: excludeNoteId } : {}),
    p_limit: 5,
  })
  const candidates = (rows ?? []).filter((r) => !dismissed.includes(r.id))
  // 후보가 없으면 AI를 부르지 않는다 — 대부분의 결정은 여기서 끝난다(비용 0).
  if (candidates.length === 0) return Response.json({ match: null })

  // 2단계: 예산 게이트는 실제로 AI를 부를 때만 확인한다.
  const budget = await checkBudget(user.id, "interactive")
  if (!budget.ok) return Response.json({ match: null }) // 예산 초과 시 조용히 건너뜀(승인 흐름을 막지 않는다)

  const startedAt = Date.now()
  try {
    const { object, usage } = await generateObject({
      model: anthropic(MODELS.cheap),
      schema,
      system:
        "새 결정이 과거 결정을 뒤집는지 판정합니다.\n" +
        "- replaces: 같은 대상에 대해 다른 값·방침으로 바꿈(예: 가격 9,900 → 12,000)\n" +
        "- refines: 같은 결정을 더 구체화(원 결정은 여전히 유효). 예: '9,900원' → '9,900원(VAT 별도)'\n" +
        "- contradicts: 과거 결정과 정면으로 어긋남\n" +
        "- unrelated: 주제가 다르면 주저 없이 unrelated. **애매하면 unrelated를 고르세요.**\n" +
        "확신이 낮으면 confidence를 낮게 주세요. 억지로 연결하지 마세요.",
      prompt:
        `새 결정: ${statement}\n\n과거 결정 후보:\n` +
        candidates.map((c) => `- id=${c.id} | ${c.decided_at} | ${c.statement}`).join("\n"),
      temperature: 0,
    })
    await recordAiUsage(supabase, {
      workspaceId,
      userId: user.id,
      model: MODELS.cheap,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      startedAt,
    })

    // confidence 0.6 미만 또는 unrelated면 사람에게 묻지 않는다(오탐 질문이 이런 기능을 죽인다)
    if (!object.candidate_id || object.relation === "unrelated" || object.confidence < 0.6) {
      return Response.json({ match: null })
    }
    const hit = candidates.find((c) => c.id === object.candidate_id)
    if (!hit) return Response.json({ match: null })

    return Response.json({
      match: {
        id: hit.id,
        statement: hit.statement,
        decided_at: hit.decided_at,
        relation: object.relation,
        confidence: object.confidence,
        reason: object.reason,
      },
    })
  } catch {
    return Response.json({ match: null }) // 판정 실패는 조용히 — 승인 자체는 이미 끝났다
  }
}
