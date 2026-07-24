// MCP OAuth 2.1(+DCR) 클라이언트 — @ai-sdk/mcp의 저수준 auth() 드라이버를 감싼다.
// 플로우(연결/콜백 라우트)용 Provider와 런타임(실제 도구 호출)용 Provider를 분리:
// - Flow: 브라우저 리다이렉트·PKCE 왕복(연결 최초 1회)을 다룬다.
// - Runtime: 저장된 토큰으로 헤더를 채우고, 401 시 refresh_token으로 자동 갱신한다(리다이렉트는 서버사이드라 불가 — no-op).
import type { OAuthClientProvider, OAuthClientInformation, OAuthClientMetadata, OAuthTokens } from "@ai-sdk/mcp"
import { createAdminClient } from "@/lib/supabase/admin"
import { encryptToken, decryptToken } from "@/lib/google/crypto"
import { MCP_CONNECTORS, credentialKeyFor } from "@/lib/mcp"

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

export function oauthRedirectUrl(connectorId: string): string {
  return `${appUrl()}/api/mcp/oauth/${connectorId}/callback`
}

/** 커넥터의 크리덴셜 조회 키 — 여러 커넥터가 한 OAuth 앱을 공유(구글 3형제)할 수 있어 id와 다를 수 있다. */
function credKey(connectorId: string): string {
  const c = MCP_CONNECTORS.find((x) => x.id === connectorId)
  return c ? credentialKeyFor(c) : connectorId
}

function clientMetadataFor(connectorId: string): OAuthClientMetadata {
  const c = MCP_CONNECTORS.find((x) => x.id === connectorId)
  return {
    redirect_uris: [oauthRedirectUrl(connectorId)],
    client_name: "Complow 워크스페이스",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none", // 공개 클라이언트(PKCE) — DCR 경로 기본값. 정적 confidential 클라이언트는
    // clientInformation()이 client_secret을 반환하면 SDK가 자동으로 client_secret_post 사용(auth 메서드는 이 값과 무관).
    // 구글처럼 스코프 자동발견이 안 되는 서비스는 명시 스코프 필요 — startAuthorization이 clientMetadata.scope를 사용.
    scope: c?.oauthScope,
  }
}

/** 커넥터별 OAuth 클라이언트 정보 조회. 세 갈래:
 *  ① 정적(is_static, 대표 등록) — redirect_uri 자가치유를 건너뛰고 항상 반환(DCR 미지원 서비스라 무효화하면 안 됨).
 *  ② DCR 등록 — 앱 주소가 바뀌면 redirect_uri 불일치로 무효 처리 → auth()가 새 주소로 자동 재등록(자가치유).
 *  전 직원이 같은 앱 신원(client_id) 공유(service_role 전용 테이블, RLS 정책 없음). */
async function loadClientInformation(connectorId: string): Promise<OAuthClientInformation | undefined> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("mcp_oauth_clients")
    .select("client_id, client_secret, redirect_uri, is_static")
    .eq("connector_id", credKey(connectorId))
    .maybeSingle()
  if (!data) return undefined
  // 정적(대표 등록) 크리덴셜은 자가치유 대상이 아님 — redirect_uri 불일치여도 그대로 사용(DCR 재등록 시 실패).
  if (!data.is_static && data.redirect_uri && data.redirect_uri !== oauthRedirectUrl(connectorId)) return undefined
  return { client_id: data.client_id, client_secret: data.client_secret ?? undefined }
}
async function persistClientInformation(connectorId: string, info: OAuthClientInformation): Promise<void> {
  const admin = createAdminClient()
  const key = credKey(connectorId)
  // 정적 크리덴셜(대표 등록)은 DCR 결과로 절대 덮지 않는다(가드). 정적 커넥터는 애초에 DCR을 타지 않지만,
  // 만에 하나 자가치유 경로가 열려도 정적값이 유지되도록 방어.
  const { data: existing } = await admin
    .from("mcp_oauth_clients")
    .select("is_static")
    .eq("connector_id", key)
    .maybeSingle()
  if (existing?.is_static) return
  await admin
    .from("mcp_oauth_clients")
    .upsert(
      {
        connector_id: key,
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
