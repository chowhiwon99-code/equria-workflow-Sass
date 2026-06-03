import { NextResponse } from "next/server"
import crypto from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { oauthClient, GOOGLE_SCOPES } from "@/lib/google/oauth"

export const runtime = "nodejs"

/** Google 연결 시작 — 동의화면으로 redirect(offline + consent로 refresh_token 확보). CSRF state 쿠키. */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  let url: string
  try {
    const auth = oauthClient()
    const nonce = crypto.randomBytes(16).toString("hex")
    url = auth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
      state: nonce,
    })
    const res = NextResponse.redirect(url)
    res.cookies.set("g_oauth_state", nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    })
    return res
  } catch {
    // 환경변수 미설정 등 — 안내와 함께 메일 화면으로
    return NextResponse.redirect(
      new URL("/mail?google=not_configured", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
    )
  }
}
