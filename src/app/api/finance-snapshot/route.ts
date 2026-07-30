import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserWorkspaceId } from "@/lib/workspace"

export const runtime = "nodejs"

// 대시보드 손익 스냅샷 노출 설정(마이그 121 workspaces.finance_snapshot_open).
// 게이팅은 UI 레벨 — finance_entries RLS(멤버 전체 읽기)는 그대로, 재무 탭 열람 범위와 동일.

/** 노출 상태 조회 — { open, isManager, canView }. 게스트/무소속은 canView=false. */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // getUserWorkspaceId는 guest 멤버십 제외 — 게스트만인 사용자는 null → 항상 숨김
  const wsId = await getUserWorkspaceId(supabase, user.id)
  if (!wsId) return NextResponse.json({ open: false, isManager: false, canView: false })

  const admin = createAdminClient()
  const [{ data: ws }, { data: prof }] = await Promise.all([
    admin.from("workspaces").select("finance_snapshot_open, owner_id").eq("id", wsId).maybeSingle(),
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ])
  const open = !!ws?.finance_snapshot_open
  const isManager = prof?.role === "admin" || ws?.owner_id === user.id
  return NextResponse.json({ open, isManager, canView: isManager || open })
}

/** 노출 범위 설정 (관리자/오너만). body: { open: boolean } — true=전 직원 공개. */
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { open?: unknown }
  if (typeof body.open !== "boolean") {
    return NextResponse.json({ error: "open(boolean)이 필요해요." }, { status: 400 })
  }

  const wsId = await getUserWorkspaceId(supabase, user.id)
  if (!wsId) return NextResponse.json({ error: "워크스페이스를 찾을 수 없어요." }, { status: 404 })

  const admin = createAdminClient()
  const [{ data: ws }, { data: prof }] = await Promise.all([
    admin.from("workspaces").select("owner_id").eq("id", wsId).maybeSingle(),
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ])
  const isManager = prof?.role === "admin" || ws?.owner_id === user.id
  if (!isManager) return NextResponse.json({ error: "관리자/오너만 가능해요." }, { status: 403 })

  const { error } = await admin.from("workspaces").update({ finance_snapshot_open: body.open }).eq("id", wsId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, open: body.open })
}
