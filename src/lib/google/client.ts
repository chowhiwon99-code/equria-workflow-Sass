// 직원별 Google API 클라이언트 — refresh_token으로 access_token 자동 갱신.
// 서버 전용. service_role(admin)로 토큰 행을 읽고, 복호화한 refresh_token만 사용.
import { google } from "googleapis"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/types"
import { oauthClient } from "./oauth"
import { encryptToken, decryptToken } from "./crypto"

/** 연결 안 됨/토큰 없음 식별용 에러 메시지. 라우트에서 412로 매핑. */
export const GOOGLE_NOT_CONNECTED = "GOOGLE_NOT_CONNECTED"

type GCUpdate = Database["public"]["Tables"]["google_connections"]["Update"]

export async function getGoogleAuthForUser(userId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from("google_connections")
    .select("refresh_token, is_active")
    .eq("user_id", userId)
    .maybeSingle()

  if (!data || !data.is_active || !data.refresh_token) {
    throw new Error(GOOGLE_NOT_CONNECTED)
  }

  const auth = oauthClient()
  auth.setCredentials({ refresh_token: decryptToken(data.refresh_token) })

  // 라이브러리가 access_token을 자동 재발급할 때마다 암호화해 저장(드물게 회전된 refresh_token 포함).
  // ⚠️ Supabase 쿼리빌더는 lazy thenable — await/.then 없으면 HTTP 전송이 안 됨(safe-changes §5).
  //    핸들러를 async로 만들어 실제로 저장한다. 안 하면 회전된 refresh_token이 유실돼 Gmail/Drive가 조용히 끊김.
  auth.on("tokens", async (tokens) => {
    const patch: GCUpdate = { updated_at: new Date().toISOString() }
    if (tokens.access_token) patch.access_token = encryptToken(tokens.access_token)
    if (tokens.refresh_token) patch.refresh_token = encryptToken(tokens.refresh_token)
    if (tokens.expiry_date) patch.expires_at = new Date(tokens.expiry_date).toISOString()
    const { error } = await admin.from("google_connections").update(patch).eq("user_id", userId)
    if (error) console.error("[google] 토큰 갱신 저장 실패:", error.message)
  })

  return auth
}

export async function getGmailForUser(userId: string) {
  return google.gmail({ version: "v1", auth: await getGoogleAuthForUser(userId) })
}

export async function getDriveForUser(userId: string) {
  return google.drive({ version: "v3", auth: await getGoogleAuthForUser(userId) })
}
