import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { Database } from "@/lib/supabase/types"

/** 인증 화면 — 미로그인 공개, 로그인 상태면 앱(대시보드)으로 보냄. 루트(/) 랜딩은 로그인해도 열람(2026-07-28 대표 결정). */
const AUTH_PATHS = ["/login", "/signup"]
/** 법적 문서·검색엔진 파일·OAuth 콜백 — 로그인 여부와 무관하게 항상 접근.
 *  /auth/callback은 code 교환 "전"이라 세션이 없음 → 여기 없으면 프록시가 /login으로 튕겨 OAuth가 영원히 실패. */
// ⚠️ 여기 빠지면 미인증 요청이 /login으로 리다이렉트돼 조용히 실패한다(sitemap·robots가 그랬던 전례).
//    PWA 4종은 브라우저가 '로그인 전에' 가져가므로 반드시 공개여야 설치 버튼이 뜬다.
const OPEN_PATHS = [
  "/privacy",
  "/terms",
  "/refund",
  "/sitemap.xml",
  "/robots.txt",
  "/auth/callback",
  "/join",
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
  "/icons/",
  "/download",
  // 🔴 결제 서버간 통신 — 여기 없으면 결제가 조용히 전부 실패한다.
  //    ① /api/billing/nicepay/return: 나이스페이 결제창이 **크로스사이트로 POST**한다.
  //       Supabase 세션 쿠키는 SameSite=Lax라 이 요청에 실리지 않아 user=null이 되고,
  //       위 리다이렉트 규칙이 /login으로 튕겨 **승인 API 호출 자체가 실행되지 않는다.**
  //    ② /api/billing/nicepay/webhook: 나이스페이 서버가 직접 호출한다(쿠키 없음).
  //    ③ /api/billing/reconcile: Vercel 크론이 호출한다(쿠키 없음).
  //    셋 다 요청자의 신원을 믿지 않는다 — ①②는 주문번호로 우리 DB를 찾고 PG 조회 API로
  //    재확인하며, ③은 CRON_SECRET을 검증한다. 즉 공개해도 권한이 열리지 않는다.
  "/api/billing/nicepay",
  "/api/billing/reconcile",
]

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
