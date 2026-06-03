import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { oauthClient } from "@/lib/google/oauth"
import { decryptToken } from "@/lib/google/crypto"

export const runtime = "nodejs"

/** Google 연결 끊기 — refresh_token revoke + 토큰 비우고 is_active=false. */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from("google_connections")
    .select("refresh_token")
    .eq("user_id", user.id)
    .maybeSingle()

  if (data?.refresh_token) {
    try {
      await oauthClient().revokeToken(decryptToken(data.refresh_token))
    } catch {
      // revoke 실패해도 로컬 토큰은 제거
    }
  }

  await admin
    .from("google_connections")
    .update({ is_active: false, access_token: null, refresh_token: null, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)

  return NextResponse.json({ ok: true })
}
