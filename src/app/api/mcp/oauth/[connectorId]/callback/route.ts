import { NextResponse } from "next/server"
import { auth } from "@ai-sdk/mcp"
import { createClient } from "@/lib/supabase/server"
import { MCP_CONNECTORS } from "@/lib/mcp"
import { McpOAuthFlowProvider } from "@/lib/mcp/oauth"

export const runtime = "nodejs"

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

/** MCP OAuth 동의 후 콜백 — code 교환 → 토큰 암호화 저장(service_role). state(쿠키) CSRF 검증. */
export async function GET(req: Request, { params }: { params: Promise<{ connectorId: string }> }) {
  const { connectorId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL("/login", appUrl()))

  const fail = () => {
    const res = NextResponse.redirect(new URL("/mcp?oauth=error", appUrl()))
    res.cookies.set("mcp_oauth_pkce", "", { maxAge: 0, path: "/" })
    return res
  }

  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookieRaw = req.headers.get("cookie")?.match(/(?:^|;\s*)mcp_oauth_pkce=([^;]+)/)?.[1]
  if (!code || !state || !cookieRaw) return fail()

  let pkce: { connectorId: string; state: string; codeVerifier: string }
  try {
    pkce = JSON.parse(Buffer.from(cookieRaw, "base64url").toString("utf8"))
  } catch {
    return fail()
  }
  if (pkce.connectorId !== connectorId || pkce.state !== state) return fail()

  const connector = MCP_CONNECTORS.find((c) => c.id === connectorId)
  if (!connector?.preset) return fail()

  try {
    const provider = new McpOAuthFlowProvider(connectorId, user.id, {
      state: pkce.state,
      codeVerifier: pkce.codeVerifier,
    })
    const result = await auth(provider, {
      serverUrl: connector.preset.url,
      authorizationCode: code,
      callbackState: state,
    })
    if (result !== "AUTHORIZED") return fail()

    const res = NextResponse.redirect(new URL(`/mcp?oauth=connected&connector=${connectorId}`, appUrl()))
    res.cookies.set("mcp_oauth_pkce", "", { maxAge: 0, path: "/" })
    return res
  } catch {
    return fail()
  }
}
