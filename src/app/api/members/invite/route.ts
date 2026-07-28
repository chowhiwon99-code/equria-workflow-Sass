import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 오너(워크스페이스 소유자) 전용 — 구글 이메일로 구성원 초대.
// admin API로 계정을 실제 Gmail 주소로 미리 생성(비밀번호 없음·이메일 확인 완료 처리)
// → handle_new_user 트리거가 profiles+workspace_members 자동 등록
// → 당사자는 로그인 화면 'Google로 계속하기'만 누르면 이메일 일치로 자동 연결·로그인.
// Supabase '신규 가입 허용'이 꺼져 있어도 admin API라 동작(외부인 가입 차단은 유지).
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as { email?: string; name?: string } | null
  const email = body?.email?.trim().toLowerCase() ?? ""
  const name = body?.name?.trim() ?? ""
  if (!EMAIL_RE.test(email)) return new Response("올바른 이메일을 입력해 주세요.", { status: 400 })
  if (!name) return new Response("이름을 입력해 주세요.", { status: 400 })

  const admin = createAdminClient()

  // 오너 게이트 (members/[id] DELETE와 동일 패턴)
  const { data: owned } = await admin.from("workspaces").select("id").eq("owner_id", user.id)
  if ((owned ?? []).length === 0) return new Response("관리자(대표)만 초대할 수 있어요.", { status: 403 })

  const { error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name },
  })
  if (error) {
    if (/already|exist|registered/i.test(error.message)) {
      return new Response("이미 등록된 이메일이에요.", { status: 409 })
    }
    return new Response(error.message, { status: 500 })
  }
  return Response.json({ ok: true })
}
