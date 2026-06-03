import { NextResponse } from "next/server"
import { google } from "googleapis"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/types"
import { oauthClient } from "@/lib/google/oauth"
import { encryptToken } from "@/lib/google/crypto"

export const runtime = "nodejs"

type GCInsert = Database["public"]["Tables"]["google_connections"]["Insert"]

/** Google 동의 후 콜백 — code 교환 → 토큰 암호화 저장(service_role). state(쿠키 nonce) CSRF 검증. */
export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL("/login", req.url))

  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookieState = req.headers.get("cookie")?.match(/(?:^|;\s*)g_oauth_state=([^;]+)/)?.[1]

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/mail?google=error", req.url))
  }

  try {
    const auth = oauthClient()
    const { tokens } = await auth.getToken(code)
    auth.setCredentials(tokens)

    let googleEmail: string | null = null
    try {
      const oauth2 = google.oauth2({ version: "v2", auth })
      const me = await oauth2.userinfo.get()
      googleEmail = me.data.email ?? null
    } catch {
      // userinfo 실패해도 연결 자체는 진행
    }

    const patch: GCInsert = {
      user_id: user.id,
      google_email: googleEmail,
      is_active: true,
      scopes: tokens.scope ? tokens.scope.split(" ") : [],
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      token_type: tokens.token_type ?? null,
      updated_at: new Date().toISOString(),
    }
    if (tokens.access_token) patch.access_token = encryptToken(tokens.access_token)
    // refresh_token은 최초 동의에만 옴 → 있을 때만 갱신(없으면 기존 보존).
    if (tokens.refresh_token) patch.refresh_token = encryptToken(tokens.refresh_token)

    const admin = createAdminClient()
    await admin.from("google_connections").upsert(patch, { onConflict: "user_id" })

    const res = NextResponse.redirect(new URL("/mail?google=connected", req.url))
    res.cookies.set("g_oauth_state", "", { maxAge: 0, path: "/" })
    return res
  } catch {
    return NextResponse.redirect(new URL("/mail?google=error", req.url))
  }
}
