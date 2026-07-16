import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

// 오너(워크스페이스 소유자) 전용 — 구성원 계정 완전 삭제.
// auth.users 삭제 → profiles(on delete cascade) → 그 사람 개인 데이터(대화·기억·연결 등) 연쇄 삭제.
// 공유 자원(그 사람이 만든 에이전트·워크플로우·프로젝트)은 created_by=set null이라 보존됨.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: targetId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })
  if (targetId === user.id) return new Response("본인 계정은 삭제할 수 없어요.", { status: 400 })

  const admin = createAdminClient()

  // 내가 오너인 워크스페이스 목록 (오너만 삭제 권한)
  const { data: owned } = await admin.from("workspaces").select("id").eq("owner_id", user.id)
  const wsIds = (owned ?? []).map((w) => w.id)
  if (wsIds.length === 0) return new Response("관리자(대표)만 삭제할 수 있어요.", { status: 403 })

  // 대상이 내 워크스페이스 구성원인지 확인(다른 워크스페이스 사용자 삭제 차단)
  const { data: mem } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("user_id", targetId)
    .in("workspace_id", wsIds)
    .maybeSingle()
  if (!mem) return new Response("이 워크스페이스 구성원이 아니에요.", { status: 403 })

  const { error } = await admin.auth.admin.deleteUser(targetId)
  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ ok: true })
}
