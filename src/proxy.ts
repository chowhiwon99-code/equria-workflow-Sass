import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { Database } from "@/lib/supabase/types"

/** 인증 화면 — 미로그인 공개, 로그인 상태면 앱(대시보드)으로 보냄. 루트(/) 랜딩은 로그인해도 열람(2026-07-28 대표 결정). */
const AUTH_PATHS = ["/login", "/signup"]
/** 법적 문서·검색엔진 파일·OAuth 콜백 — 로그인 여부와 무관하게 항상 접근.
 *  /auth/callback은 code 교환 "전"이라 세션이 없음 → 여기 없으면 프록시가 /login으로 튕겨 OAuth가 영원히 실패. */
const OPEN_PATHS = ["/privacy", "/terms", "/refund", "/sitemap.xml", "/robots.txt", "/auth/callback", "/join"]

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 세션 갱신 (getUser가 토큰을 검증하고 필요 시 갱신한다)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isRoot = pathname === "/" // 랜딩(공개)
  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p))
  const isOpen = OPEN_PATHS.some((p) => pathname.startsWith(p))

  // 미인증 사용자가 보호된 경로 접근 → 로그인으로 (랜딩·인증화면·법적문서는 공개)
  if (!user && !isRoot && !isAuthPage && !isOpen) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // 인증된 사용자가 로그인/회원가입 접근 → 대시보드로 (랜딩·법적문서는 로그인해도 그대로 열람)
  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // 정적 파일/이미지/favicon 제외한 모든 경로에 적용
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
