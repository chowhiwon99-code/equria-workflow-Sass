import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "./types"
import { ACTIVE_WS_COOKIE } from "@/lib/workspace-cookie"

/**
 * 서버 컴포넌트 / API 라우트 / 서버 액션 전용 Supabase 클라이언트.
 * next/headers의 cookies를 사용해 세션을 읽고 갱신한다.
 * 활성 워크스페이스 쿠키를 x-workspace-id 헤더로 실어 서버 SELECT도 현재 회사로 스코프(클라와 동일).
 */
export async function createClient() {
  const cookieStore = await cookies()
  const activeWs = cookieStore.get(ACTIVE_WS_COOKIE)?.value

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(activeWs ? { global: { headers: { "x-workspace-id": activeWs } } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // 서버 컴포넌트에서 호출되면 set이 막힌다 — 미들웨어가 세션을 갱신하므로 무시 가능.
          }
        },
      },
    }
  )
}
