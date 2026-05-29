import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "./types"

/**
 * 서버 컴포넌트 / API 라우트 / 서버 액션 전용 Supabase 클라이언트.
 * next/headers의 cookies를 사용해 세션을 읽고 갱신한다.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
