// MCP OAuth 2.1(+DCR) 클라이언트 — @ai-sdk/mcp의 저수준 auth() 드라이버를 감싼다.
// 플로우(연결/콜백 라우트)용 Provider와 런타임(실제 도구 호출)용 Provider를 분리:
// - Flow: 브라우저 리다이렉트·PKCE 왕복(연결 최초 1회)을 다룬다.
// - Runtime: 저장된 토큰으로 헤더를 채우고, 401 시 refresh_token으로 자동 갱신한다(리다이렉트는 서버사이드라 불가 — no-op).
import type { OAuthClientProvider, OAuthClientInformation, OAuthClientMetadata, OAuthTokens } from "@ai-sdk/mcp"
import { createAdminClient } from "@/lib/supabase/admin"
import { encryptToken, decryptToken } from "@/lib/google/crypto"

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

export function oauthRedirectUrl(connectorId: string): string {
  return `${appUrl()}/api/mcp/oauth/${connectorId}/callback`
}

function clientMetadataFor(connectorId: string): OAuthClientMetadata {
  return {
    redirect_uris: [oauthRedirectUrl(connectorId)],
    client_name: "Complow 워크스페이스",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none", // 공개 클라이언트(PKCE) — 시크릿 저장/관리 불필요
  }
}

/** 커넥터별 DCR 등록 정보 조회 — 전 직원이 같은 앱 신원(client_id) 공유(service_role 전용 테이블, RLS 정책 없음). */
async function loadClientInformation(connectorId: string): Promise<OAuthClientInformation | undefined> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("mcp_oauth_clients")
    .select("client_id, client_secret, redirect_uri")
    .eq("connector_id", connectorId)
    .maybeSingle()
  if (!data) return undefined
  // 저장된 redirect_uri가 현재 기대값과 다르면(앱 주소·도메인 변경) 무효 처리 →
  // auth()가 새 주소로 DCR 재등록(자가치유). 수동 DB 삭제 불필요.
  if (data.redirect_uri && data.redirect_uri !== oauthRedirectUrl(connectorId)) return undefined
  return { client_id: data.client_id, client_secret: data.client_secret ?? undefined }
}
async function persistClientInformation(connectorId: string, info: OAuthClientInformation): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from("mcp_oauth_clients")
    .upsert(
      {
        connector_id: connectorId,
        client_id: info.client_id,
        client_secret: info.client_secret ?? null,
        redirect_uri: oauthRedirectUrl(connectorId),
      },
      { onConflict: "connector_id" }
    )
}

/** 특정 (유저,커넥터) 연결 행에 토큰 저장(암호화) — 없으면 새로 생성. */
async function persistTokens(userId: string, connectorId: string, tokens: OAuthTokens): Promise<void> {
  const admin = createAdminClient()
  await admin.from("mcp_user_connections").upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      auth_method: "oauth",
      encrypted_token: encryptToken(tokens.access_token),
      encrypted_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
      last_tested_at: null,
      last_test_ok: null,
      last_test_error: null,
    },
    { onConflict: "user_id,connector_id" }
  )
}

/** 연결/콜백 라우트 전용 — 브라우저 리다이렉트·PKCE 왕복(쿠키)을 다룬다. */
export class McpOAuthFlowProvider implements OAuthClientProvider {
  savedState: string | undefined
  savedCodeVerifier: string | undefined
  savedAuthUrl: URL | undefined

  constructor(
    private connectorId: string,
    private userId: string,
    private resume?: { state: string; codeVerifier: string }
  ) {}

  get redirectUrl() {
    return oauthRedirectUrl(this.connectorId)
  }
  get clientMetadata() {
    return clientMetadataFor(this.connectorId)
  }
  clientInformation() {
    return loadClientInformation(this.connectorId)
  }
  async saveClientInformation(info: OAuthClientInformation) {
    await persistClientInformation(this.connectorId, info)
  }
  tokens(): OAuthTokens | undefined {
    return undefined // 최초 연결 플로우 — 기존 토큰을 여기서 재사용하지 않음(재연결은 항상 새 인가부터)
  }
  async saveTokens(tokens: OAuthTokens) {
    await persistTokens(this.userId, this.connectorId, tokens)
  }
  redirectToAuthorization(url: URL) {
    this.savedAuthUrl = url
  }
  async saveCodeVerifier(v: string) {
    this.savedCodeVerifier = v
  }
  codeVerifier(): string {
    if (this.resume) return this.resume.codeVerifier
    throw new Error("code verifier not available")
  }
  state(): string {
    return crypto.randomUUID()
  }
  async saveState(s: string) {
    this.savedState = s
  }
  storedState() {
    return this.resume?.state
  }
}

/** 실제 도구 호출(채팅·워크플로우) 전용 — 저장된 토큰으로 헤더 채움, 만료 시 refresh_token으로 자동 갱신.
 * redirectToAuthorization은 no-op(서버사이드라 리다이렉트 불가 — 갱신 실패는 UnauthorizedError로 자연 실패해 connectMcp 호출측이 건너뜀). */
export class McpOAuthRuntimeProvider implements OAuthClientProvider {
  constructor(
    private connectorId: string,
    private userId: string,
    private encryptedToken: string,
    private encryptedRefreshToken: string | null
  ) {}

  get redirectUrl() {
    return oauthRedirectUrl(this.connectorId)
  }
  get clientMetadata() {
    return clientMetadataFor(this.connectorId)
  }
  clientInformation() {
    return loadClientInformation(this.connectorId)
  }
  async saveClientInformation(info: OAuthClientInformation) {
    await persistClientInformation(this.connectorId, info)
  }
  tokens(): OAuthTokens | undefined {
    try {
      return {
        access_token: decryptToken(this.encryptedToken),
        token_type: "bearer",
        refresh_token: this.encryptedRefreshToken ? decryptToken(this.encryptedRefreshToken) : undefined,
      }
    } catch {
      return undefined
    }
  }
  async saveTokens(tokens: OAuthTokens) {
    await persistTokens(this.userId, this.connectorId, tokens)
  }
  redirectToAuthorization() {
    /* no-op */
  }
  async saveCodeVerifier() {
    /* no-op */
  }
  codeVerifier(): string {
    throw new Error("not supported at runtime")
  }
}
