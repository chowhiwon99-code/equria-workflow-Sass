// MCP 직접 연결 런타임 — mcp_servers 행 → 원격 MCP 서버(Streamable HTTP/SSE) 클라이언트. 서버 전용.
// stdio는 서버리스(Vercel)에서 자식 프로세스 불가라 미지원(http/sse만). 호출측은 반드시 close().
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp"
import { isSafeWebhookUrl } from "@/lib/workflowTools"

export type McpServerConfig = {
  id: string
  name: string
  type: string // 'http' | 'sse'
  url: string | null
  auth_type: string // 'none' | 'bearer'
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

  const headers: Record<string, string> = {}
  if (server.auth_type === "bearer") {
    const token = process.env[mcpEnvTokenKey(server.name)]
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const transport =
    server.type === "sse"
      ? ({ type: "sse", url: server.url, headers } as const)
      : ({ type: "http", url: server.url, headers } as const)

  return await createMCPClient({ transport })
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
