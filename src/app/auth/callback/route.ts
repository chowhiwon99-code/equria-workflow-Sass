import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * 구글 OAuth 콜백 — Supabase가 인증 후 ?code=… 와 함께 여기로 리다이렉트한다.
 * code를 세션으로 교환(PKCE)하고 next(기본 대시보드)로 보낸다.
 * - 로그인 흐름 실패 → /login?error=코드 (가입차단·취소 구분)
 * - 계정 연결 흐름(next=/mypage) 실패 → next?link_error=코드 (마이페이지 카드가 표시)
 * 이 경로는 (app) 인증 게이트 밖이라 미로그인 상태에서도 접근 가능.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const rawNext = searchParams.get("next") ?? "/dashboard"
  // open redirect 방지: 같은 사이트 절대경로만 허용("//host" 형태 차단)
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard"

  // Supabase가 에러와 함께 돌아온 경우(신규가입 차단·사용자 취소·이미 연결된 계정 등)
  const errorCode = searchParams.get("error_code") ?? searchParams.get("error")
  if (errorCode) {
    if (next !== "/dashboard") {
      // 마이페이지 '구글 계정 연결' 흐름 → 원래 화면으로 에러 전달
      const url = new URL(next, origin)
      url.searchParams.set("link_error", errorCode)
      return NextResponse.redirect(url)
    }
    const mapped =
      errorCode === "signup_disabled"
        ? "signup_disabled"
        : errorCode === "access_denied"
          ? "oauth_cancelled"
          : "oauth"
    return NextResponse.redirect(`${origin}/login?error=${mapped}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`)
}
