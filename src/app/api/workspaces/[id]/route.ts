import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { OPERATOR_WORKSPACE_ID } from "@/lib/workspace"
import { ACTIVE_WS_COOKIE } from "@/lib/workspace-cookie"

export const runtime = "nodejs"
export const maxDuration = 60

type Admin = ReturnType<typeof createAdminClient>

/**
 * 워크스페이스에 딸린 스토리지 객체 경로를 버킷별로 모은다.
 * storage 경로는 {uid}/{uuid}.ext라 workspace_id가 없다 → DB 행이 가리키는 경로로만 찾을 수 있으므로
 * **워크스페이스 행을 지우기 전에** 수집해야 한다(cascade 후엔 참조가 사라진다).
 * 한계: 회의록 본문 HTML에 박힌 meeting-media 공개 URL은 추적하지 않는다(본문 파싱 필요 — 용량 미미).
 */
async function collectStoragePaths(admin: Admin, wsId: string): Promise<Record<string, string[]>> {
  const out: Record<string, Set<string>> = {}
  const add = (bucket: string, path: unknown) => {
    if (typeof path !== "string" || !path || path.startsWith("http")) return
    ;(out[bucket] ??= new Set()).add(path)
  }

  const [files, dms, msgAtt, grpAtt, cards, receipts, events, agents] = await Promise.all([
    admin.from("files").select("metadata").eq("workspace_id", wsId),
    admin.from("direct_messages").select("attachment_url").eq("workspace_id", wsId).not("attachment_url", "is", null),
    admin.from("message_attachments").select("storage_path").eq("workspace_id", wsId),
    admin.from("group_message_attachments").select("storage_path").eq("workspace_id", wsId),
    admin.from("business_cards").select("image_url").eq("workspace_id", wsId).not("image_url", "is", null),
    admin.from("finance_entries").select("receipt_url").eq("workspace_id", wsId).not("receipt_url", "is", null),
    admin.from("calendar_events").select("attachments").eq("workspace_id", wsId),
    admin.from("agents").select("id").eq("workspace_id", wsId),
  ])

  for (const f of files.data ?? []) {
    const meta = f.metadata as { storage_path?: unknown } | null
    add("files", meta?.storage_path)
  }
  for (const m of dms.data ?? []) add("chat-files", m.attachment_url)
  for (const a of msgAtt.data ?? []) add("chat-files", a.storage_path)
  for (const a of grpAtt.data ?? []) add("chat-files", a.storage_path)
  for (const c of cards.data ?? []) add("business-cards", c.image_url)
  for (const r of receipts.data ?? []) add("receipts", r.receipt_url)
  for (const e of events.data ?? []) {
    if (Array.isArray(e.attachments)) {
      for (const a of e.attachments) add("calendar-files", (a as { path?: unknown } | null)?.path)
    }
  }
  const agentIds = (agents.data ?? []).map((a) => a.id)
  if (agentIds.length) {
    const { data: kn } = await admin.from("agent_knowledge").select("storage_path").in("agent_id", agentIds)
    for (const k of kn ?? []) add("files", k.storage_path)
  }

  return Object.fromEntries(Object.entries(out).map(([b, s]) => [b, [...s]]))
}

// 오너 전용 — 워크스페이스(회사)와 그 안의 모든 데이터를 영구 삭제한다.
// DB는 workspaces FK ON DELETE CASCADE가 전부 지운다(마이그157로 누락 9개 테이블까지 보강).
// 사람 계정(profiles/auth.users)은 지우지 않는다 — 다른 회사에도 속할 수 있다(members/[id]와 같은 원칙).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: wsId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as { confirmName?: unknown } | null
  const confirmName = typeof body?.confirmName === "string" ? body.confirmName.trim() : ""

  const admin = createAdminClient()
  const { data: ws } = await admin.from("workspaces").select("id, name, owner_id").eq("id", wsId).maybeSingle()
  if (!ws) return new Response("워크스페이스를 찾을 수 없어요.", { status: 404 })
  if (ws.owner_id !== user.id) return new Response("대표(오너)만 삭제할 수 있어요.", { status: 403 })
  if (confirmName !== ws.name.trim()) return new Response("워크스페이스 이름이 일치하지 않아요.", { status: 400 })
  if (ws.id === OPERATOR_WORKSPACE_ID) {
    return new Response("플랫폼 운영 워크스페이스는 삭제할 수 없어요.", { status: 400 })
  }

  // 결제 이력이 있으면 차단 — 삭제하면 결제·환불 기록까지 cascade로 사라진다.
  const { count: payCount } = await admin
    .from("billing_payments")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", wsId)
  if ((payCount ?? 0) > 0) {
    return new Response("결제 이력이 있는 워크스페이스는 삭제할 수 없어요. 고객센터로 문의해주세요.", { status: 409 })
  }

  const paths = await collectStoragePaths(admin, wsId)

  const { error } = await admin.from("workspaces").delete().eq("id", wsId)
  if (error) return new Response(error.message, { status: 500 })

  // DB 삭제가 확정된 뒤 파일 정리(best-effort) — 실패해도 데이터는 이미 접근 불가라 응답은 성공.
  let removed = 0
  for (const [bucket, list] of Object.entries(paths)) {
    for (let i = 0; i < list.length; i += 100) {
      const { data, error: rmErr } = await admin.storage.from(bucket).remove(list.slice(i, i + 100))
      if (rmErr) console.error(`[workspace-delete] storage remove failed bucket=${bucket}`, rmErr.message)
      removed += data?.length ?? 0
    }
  }

  // 지운 워크스페이스가 활성 쿠키였다면 제거 — 남아 있으면 RLS 스코프 헤더가 없는 회사를 가리킨다.
  const cookieStore = await cookies()
  if (cookieStore.get(ACTIVE_WS_COOKIE)?.value === wsId) cookieStore.delete(ACTIVE_WS_COOKIE)

  return Response.json({ ok: true, removedFiles: removed })
}
