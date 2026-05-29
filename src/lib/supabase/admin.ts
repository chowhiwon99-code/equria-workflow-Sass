import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./types"

/**
 * service_role 키를 사용하는 관리자 클라이언트 — RLS를 우회한다.
 * ⚠️ 서버 코드(API 라우트/서버 액션)에서만 사용. 절대 클라이언트로 노출 금지.
 * 가입(초대코드 검증 후 계정 생성) 등 관리자 권한이 필요한 작업에만 쓴다.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
