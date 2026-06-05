import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * 구글 OAuth 콜백 — Supabase가 인증 후 ?code=… 와 함께 여기로 리다이렉트한다.
 * code를 세션으로 교환(PKCE)하고 대시보드로 보낸다. 실패 시 로그인으로.
 * 이 경로는 (app) 인증 게이트 밖이라 미로그인 상태에서도 접근 가능.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`)
}
