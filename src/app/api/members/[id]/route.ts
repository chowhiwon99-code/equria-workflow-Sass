import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

// 오너(워크스페이스 소유자) 전용 — 구성원을 "내 워크스페이스에서만" 제외한다(멤버십 행 삭제).
// ⚠️ B2 감사 V2: 예전엔 admin.deleteUser로 전역 auth.users를 삭제했는데, 멀티테넌트에서 한 사람이
// 여러 회사에 속할 수 있으므로(초대·게스트) 전역 삭제 = 타 회사 계정·데이터까지 파괴. 슬랙/노션처럼
// "이 워크스페이스에서 제외"만 한다. 마지막 멤버십까지 사라진 유저는 다음 로그인 때 /onboarding으로 간다.
// (개인 계정의 완전 삭제(GDPR 등)는 별도 본인-요청 흐름으로 분리 — 오너 액션 아님.)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: targetId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })
  if (targetId === user.id) return new Response("본인은 제외할 수 없어요.", { status: 400 })

  const admin = createAdminClient()

  // 내가 오너인 워크스페이스 목록 (오너만 제외 권한)
  const { data: owned } = await admin.from("workspaces").select("id").eq("owner_id", user.id)
  const wsIds = (owned ?? []).map((w) => w.id)
  if (wsIds.length === 0) return new Response("관리자(대표)만 제외할 수 있어요.", { status: 403 })

  // 대상이 내 워크스페이스 구성원인지 확인(다른 워크스페이스 사용자 접근 차단)
  const { data: mem } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("user_id", targetId)
    .in("workspace_id", wsIds)
    .maybeSingle()
  if (!mem) return new Response("이 워크스페이스 구성원이 아니에요.", { status: 403 })

  // 내 워크스페이스들에서만 멤버십 제거(전역 계정·타 회사 소속은 보존).
  const { error } = await admin
    .from("workspace_members")
    .delete()
    .eq("user_id", targetId)
    .in("workspace_id", wsIds)
  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ ok: true })
}
