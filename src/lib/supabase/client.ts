import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "./types"
import { readActiveWsCookie } from "@/lib/workspace-cookie"

/** 클라이언트 컴포넌트 전용 Supabase 클라이언트.
 *  활성 워크스페이스 쿠키를 x-workspace-id 헤더로 실어, RLS(auth_user_workspace_ids)가
 *  읽기를 현재 회사로 스코프하게 한다(워크스페이스 전환·노션식 공간 분리). 쿠키 없으면 헤더 없음=전체(기존 동작). */
export function createClient() {
  const activeWs = readActiveWsCookie()
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    activeWs ? { global: { headers: { "x-workspace-id": activeWs } } } : undefined
  )
}
