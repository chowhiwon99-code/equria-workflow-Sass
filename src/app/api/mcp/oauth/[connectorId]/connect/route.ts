import { NextResponse } from "next/server"
import { auth } from "@ai-sdk/mcp"
import { createClient } from "@/lib/supabase/server"
import { MCP_CONNECTORS } from "@/lib/mcp"
import { McpOAuthFlowProvider } from "@/lib/mcp/oauth"

export const runtime = "nodejs"

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

/** MCP OAuth 연결 시작 — 인가 서버 동의화면으로 redirect(DCR 자동 등록 포함). PKCE(state+codeVerifier)는 httpOnly 쿠키로 왕복. */
export async function GET(_req: Request, { params }: { params: Promise<{ connectorId: string }> }) {
  const { connectorId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const connector = MCP_CONNECTORS.find((c) => c.id === connectorId)
  if (!connector?.preset) {
    return NextResponse.redirect(new URL("/mcp?oauth=error", appUrl()))
  }

  try {
    const provider = new McpOAuthFlowProvider(connectorId, user.id)
    const result = await auth(provider, { serverUrl: connector.preset.url })
    if (result !== "REDIRECT" || !provider.savedAuthUrl || !provider.savedState || !provider.savedCodeVerifier) {
      throw new Error("인가 URL 생성 실패")
    }

    // 커넥터별 추가 인가 파라미터 주입 — 구글은 refresh_token을 받으려면 access_type=offline·prompt=consent가 필요.
    // (@ai-sdk/mcp의 startAuthorization은 offline_access 스코프만 처리하고 구글식 access_type은 안 붙임.)
    if (connector.authorizationParams) {
      for (const [k, v] of Object.entries(connector.authorizationParams)) {
        provider.savedAuthUrl.searchParams.set(k, v)
      }
    }

    const payload = Buffer.from(
      JSON.stringify({ connectorId, state: provider.savedState, codeVerifier: provider.savedCodeVerifier })
    ).toString("base64url")

    const res = NextResponse.redirect(provider.savedAuthUrl)
    res.cookies.set("mcp_oauth_pkce", payload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    })
    return res
  } catch {
    return NextResponse.redirect(new URL("/mcp?oauth=error", appUrl()))
  }
}
