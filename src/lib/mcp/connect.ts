// MCP 직접 연결 런타임 — mcp_servers 행 → 원격 MCP 서버(Streamable HTTP/SSE) 클라이언트. 서버 전용.
// stdio는 서버리스(Vercel)에서 자식 프로세스 불가라 미지원(http/sse만). 호출측은 반드시 close().
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp"
import { isSafeWebhookUrl } from "@/lib/workflowTools"
import { decryptToken } from "@/lib/google/crypto"
import { MCP_CONNECTORS } from "@/lib/mcp"
import { McpOAuthRuntimeProvider } from "./oauth"

export type McpServerConfig = {
  id: string
  name: string
  type: string // 'http' | 'sse'
  url: string | null
  auth_type: string // 'none' | 'bearer' | 'oauth'
  encrypted_token?: string | null // DB 암호화 저장 토큰(있으면 env보다 우선) — oauth일 땐 access_token
  /** auth_type='oauth' 전용 — 런타임 OAuthClientProvider 구성에 필요(refresh 포함). */
  oauth?: { connectorId: string; userId: string; encryptedRefreshToken: string | null }
}

/** 글로벌 MCP 서버의 베어러 토큰을 읽을 env 키(평문 DB 저장 회피). 예: "Supabase MCP" → MCP_SUPABASE_MCP_TOKEN */
export function mcpEnvTokenKey(name: string): string {
  return "MCP_" + name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") + "_TOKEN"
}

/** mcp_servers 행 → 연결된 MCP 클라이언트. SSRF 가드(https 외부만). 호출측이 close() 책임. */
export async function connectMcp(server: McpServerConfig) {
  if (!server.url) throw new Error("MCP 서버 URL이 없습니다.")
  const safe = isSafeWebhookUrl(server.url)
  if (!safe.ok) throw new Error(`허용되지 않는 MCP 주소: ${safe.reason}`)

  // oauth = 토큰을 헤더에 직접 넣지 않고 authProvider로 위임(401 시 refresh_token 자동 갱신, @ai-sdk/mcp 내장).
  if (server.auth_type === "oauth" && server.oauth && server.encrypted_token) {
    const authProvider = new McpOAuthRuntimeProvider(
      server.oauth.connectorId,
      server.oauth.userId,
      server.encrypted_token,
      server.oauth.encryptedRefreshToken
    )
    const transport =
      server.type === "sse"
        ? ({ type: "sse", url: server.url, authProvider } as const)
        : ({ type: "http", url: server.url, authProvider } as const)
    return await createMCPClient({ transport })
  }

  const headers: Record<string, string> = {}
  if (server.auth_type === "bearer") {
    // DB에 암호화 저장된 토큰 우선, 없으면 env 폴백(레거시).
    let token: string | undefined
    if (server.encrypted_token) {
      try {
        token = decryptToken(server.encrypted_token)
      } catch {
        /* 손상된 토큰은 무시하고 env로 폴백 */
      }
    }
    if (!token) token = process.env[mcpEnvTokenKey(server.name)] ?? undefined
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const transport =
    server.type === "sse"
      ? ({ type: "sse", url: server.url, headers } as const)
      : ({ type: "http", url: server.url, headers } as const)

  return await createMCPClient({ transport })
}

/** mcp_user_connections 행(직원 개인 연결) → connectMcp 설정. 프리셋 URL/타입은 lib/mcp.ts 카탈로그에서 조회
 * (개인 연결 테이블엔 url/type을 따로 저장하지 않음 — 검증된 프리셋만 쓰게 해 임의 URL 연결을 막는다).
 * 카탈로그에서 사라졌거나 인증 방식이 안 맞으면 null(호출측이 건너뜀). */
export function resolveUserConnectionConfig(
  row: {
    id: string
    connector_id: string
    auth_method: string
    encrypted_token: string
    encrypted_refresh_token: string | null
  },
  userId: string
): McpServerConfig | null {
  const connector = MCP_CONNECTORS.find((c) => c.id === row.connector_id)
  if (!connector?.preset) return null
  if (row.auth_method === "oauth") {
    return {
      id: row.id,
      name: connector.name,
      type: connector.preset.type,
      url: connector.preset.url,
      auth_type: "oauth",
      encrypted_token: row.encrypted_token,
      oauth: { connectorId: row.connector_id, userId, encryptedRefreshToken: row.encrypted_refresh_token },
    }
  }
  if (connector.preset.auth !== "bearer") return null
  return {
    id: row.id,
    name: connector.name,
    type: connector.preset.type,
    url: connector.preset.url,
    auth_type: "bearer",
    encrypted_token: row.encrypted_token,
  }
}

export type DiscoveredTool = { name: string; description: string }

/** 연결 → 도구 목록 디스커버리(이름·설명). 테스트/캐시 갱신용. 끝나면 close. */
export async function discoverMcpTools(server: McpServerConfig): Promise<DiscoveredTool[]> {
  const client = await connectMcp(server)
  try {
    const tools = await client.tools()
    return Object.entries(tools).map(([name, t]) => ({
      name,
      description: (t as { description?: string }).description ?? "",
    }))
  } finally {
    await client.close()
  }
}
