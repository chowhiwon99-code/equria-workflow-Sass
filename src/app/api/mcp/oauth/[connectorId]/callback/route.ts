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

  // 팝업 모드(위저드 내 연결): 리다이렉트 대신 스스로 닫히는 페이지 — opener(픽커)가 postMessage로 목록 갱신.
  const popupClose = (ok: boolean) => {
    const html = `<!doctype html><meta charset="utf-8"><title>${ok ? "연결 완료" : "연결 실패"}</title>
<p style="font-family:sans-serif;text-align:center;margin-top:40vh;color:#555">${ok ? "연결됐어요 — 이 창은 곧 닫힙니다." : "연결에 실패했어요 — 창을 닫고 다시 시도해 주세요."}</p>
<script>try{window.opener&&window.opener.postMessage({type:"mcp-oauth",ok:${ok},connector:${JSON.stringify(connectorId)}},window.location.origin)}catch(e){}
setTimeout(function(){window.close()},400)</script>`
    const res = new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
    res.cookies.set("mcp_oauth_pkce", "", { maxAge: 0, path: "/" })
    return res
  }
  let isPopup = false
  const fail = () => {
    if (isPopup) return popupClose(false)
    const res = NextResponse.redirect(new URL("/mcp?oauth=error", appUrl()))
    res.cookies.set("mcp_oauth_pkce", "", { maxAge: 0, path: "/" })
    return res
  }

  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookieRaw = req.headers.get("cookie")?.match(/(?:^|;\s*)mcp_oauth_pkce=([^;]+)/)?.[1]
  if (!code || !state || !cookieRaw) return fail()

  let pkce: { connectorId: string; state: string; codeVerifier: string; popup?: boolean }
  try {
    pkce = JSON.parse(Buffer.from(cookieRaw, "base64url").toString("utf8"))
  } catch {
    return fail()
  }
  isPopup = pkce.popup === true
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

    if (isPopup) return popupClose(true)
    const res = NextResponse.redirect(new URL(`/mcp?oauth=connected&connector=${connectorId}`, appUrl()))
    res.cookies.set("mcp_oauth_pkce", "", { maxAge: 0, path: "/" })
    return res
  } catch {
    return fail()
  }
}
