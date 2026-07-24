// 기억 정리 적용 — 사용자가 미리보기(organize)에서 확인한 "정리된 목록"을 실제로 반영.
// 안전: 새 목록을 먼저 insert → 기존(replaceIds)을 soft-delete(deleted_at). 조용히 안 지움(휴지통에 남아 복구 가능·RLS 본인만).
import { createClient } from "@/lib/supabase/server"
import { isMemoryKind } from "@/lib/agentMemory"

export const runtime = "nodejs"

type IncomingMemory = { kind?: string; content?: string; importance?: number }

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as
    | { memories?: IncomingMemory[]; replaceIds?: string[] }
    | null
  const rawMemories = Array.isArray(body?.memories) ? body!.memories! : []
  const replaceIds = Array.isArray(body?.replaceIds) ? body!.replaceIds!.filter((x) => typeof x === "string") : []

  // 정리된 목록 정제(빈 값·과길이 제외, kind 검증, importance 1~3 클램프).
  const rows = rawMemories
    .map((m) => {
      const content = (m.content ?? "").trim()
      if (!content || content.length > 400) return null
      return {
        agent_id: agentId,
        user_id: user.id,
        kind: isMemoryKind(m.kind) ? m.kind : "preference",
        content,
        importance: Math.min(3, Math.max(1, Math.round(Number(m.importance) || 2))),
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  // 1) 새 목록 먼저 insert(있을 때만). 실패 시 기존을 지우지 않아 데이터 유실 없음.
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("agent_memories").insert(rows)
    if (insErr) return new Response(insErr.message, { status: 500 })
  }

  // 2) 기존 목록 soft-delete(휴지통). RLS가 본인 것만 허용.
  if (replaceIds.length > 0) {
    await supabase
      .from("agent_memories")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", replaceIds)
      .is("deleted_at", null)
  }

  // 정리 후 활성 목록 반환(패널 즉시 갱신용).
  const { data } = await supabase
    .from("agent_memories")
    .select("id, kind, content, importance, created_at")
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
  return Response.json({ memories: data ?? [] })
}
