// MCP 도구 로딩 공용 골격 — 에이전트 채팅에서 추출(P3). 회의 노트 "창고에 질문"도 같은 경로를 쓴다.
//
// 🔴 여기 규약을 깨면 프롬프트 캐시가 통째로 무효가 되거나 MCP 연결이 누수된다:
//  1. **이름순 정렬은 캐시를 살리는 장치다(장식 아님).** 도구 정의는 프롬프트 맨 앞(position 0)에
//     렌더된다(tools → system → messages). 배열이 1바이트만 달라져도 그 뒤가 전부 무효다. 그런데
//     들어오는 순서는 우리가 정하지 않는다 — MCP 서버의 tools() 순서는 규격상 보장되지 않고,
//     토큰 만료 재연결이 끼면 늦게 push된다. 그래서 마지막에 이름순으로 고정한다.
//     (실측: Notion 커넥터 하나가 입력 91,706토큰 — 무효화되면 매번 정가.)
//  2. **쿼리 .order()는 필수** — 같은 이유로 행 순서가 흔들리면 안 된다.
//  3. **이 모듈의 Promise는 절대 reject하지 않는다.** 호출부가 Promise.all의 leg로 쓰는데,
//     fail-fast가 일어나면 비행 중이던 MCP 클라이언트를 아무도 닫지 못한다(세션56 적대리뷰 발견).
//  4. tools() 실패 시 이미 열린 클라이언트는 즉시 닫는다(누수 방지).
import type { ToolSet } from "ai"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { connectMcp, resolveUserConnectionConfig } from "@/lib/mcp/connect"
import { MCP_CONNECTORS } from "@/lib/mcp"

type DB = SupabaseClient<Database>
type McpClient = Awaited<ReturnType<typeof connectMcp>>
export type McpLoaded = { client: McpClient; tools: ToolSet } | null

const CONN_COLS = "id, connector_id, auth_method, encrypted_token, encrypted_refresh_token"

async function connectSafely(cfg: Parameters<typeof connectMcp>[0]): Promise<McpLoaded> {
  let client: McpClient | null = null
  try {
    client = await connectMcp(cfg)
    return { client, tools: await client.tools() }
  } catch {
    if (client) void client.close().catch(() => {})
    return null
  }
}

/**
 * 워크스페이스 MCP 서버 + 실행자 개인 커넥터의 도구를 **병렬로** 로드하기 시작한다(TTFT의 최대 지분).
 * 즉시 시작되는 PromiseLike를 돌려주므로 호출부의 Promise.all에 leg로 넣으면 된다.
 * 결과 순서: 서버들 → 커넥터들(쿼리 order 보존). reject하지 않는다(규약 3).
 */
export function startMcpToolLoad({
  supabase,
  userId,
  serverIds = [],
  connectorIds = [],
}: {
  supabase: DB
  userId: string
  /** mcp_servers.id 목록(워크스페이스 공용 서버) */
  serverIds?: string[]
  /** lib/mcp.ts의 connector_id 슬러그 목록(개인 연결) */
  connectorIds?: string[]
}): PromiseLike<McpLoaded[]> {
  const serversP: PromiseLike<McpLoaded[]> =
    serverIds.length === 0
      ? Promise.resolve([])
      : supabase
          .from("mcp_servers")
          .select("id, name, type, url, auth_type, is_active, encrypted_token")
          .in("id", serverIds)
          .eq("is_active", true)
          .order("created_at", { ascending: true }) // ⚠️ 규약 2
          .order("id", { ascending: true })
          .then(({ data }) => Promise.all((data ?? []).map((srv) => connectSafely(srv))))

  const connectorsP: PromiseLike<McpLoaded[]> =
    connectorIds.length === 0
      ? Promise.resolve([])
      : supabase
          .from("mcp_user_connections")
          .select(CONN_COLS)
          .eq("user_id", userId)
          .in("connector_id", connectorIds)
          .order("created_at", { ascending: true }) // ⚠️ 규약 2
          .order("id", { ascending: true })
          .then(({ data }) =>
            Promise.all(
              (data ?? []).map(async (row): Promise<McpLoaded> => {
                const cfg = resolveUserConnectionConfig(row, userId)
                if (!cfg) return null
                const first = await connectSafely(cfg)
                if (first) return first
                // access token 만료 시 일부 서버(구글 gmailmcp 등)가 첫 호출에 401을 던지는데,
                // 그 과정에서 SDK OAuth 프로바이더가 refresh_token으로 갱신해 DB에 저장한다.
                // → 갱신된 행을 다시 읽어 1회만 재연결(이게 없으면 만료 직후 첫 요청이 항상 실패).
                try {
                  const { data: fresh } = await supabase
                    .from("mcp_user_connections")
                    .select(CONN_COLS)
                    .eq("id", row.id)
                    .maybeSingle()
                  const retryCfg = fresh ? resolveUserConnectionConfig(fresh, userId) : null
                  return retryCfg ? await connectSafely(retryCfg) : null
                } catch {
                  return null /* 재시도도 실패하면 이 커넥터 없이 진행 — 채팅 자체는 계속된다 */
                }
              }),
            ),
          )

  return Promise.all([serversP, connectorsP]).then(([s, c]) => [...s, ...c])
}

/** 로드 결과 → {클라이언트 목록, 이름순 고정 도구셋, 정리 함수}. 규약 1의 정렬이 여기서 일어난다. */
export function collectMcpTools(results: McpLoaded[]): {
  clients: McpClient[]
  tools: ToolSet
  closeAll: () => Promise<unknown>
} {
  const clients: McpClient[] = []
  const sets: ToolSet[] = []
  for (const r of results) {
    if (r) {
      clients.push(r.client)
      sets.push(r.tools)
    }
  }
  const merged: ToolSet = Object.assign({}, ...sets)
  const tools: ToolSet = Object.fromEntries(
    Object.keys(merged)
      .sort()
      .map((name) => [name, merged[name]]),
  )
  return { clients, tools, closeAll: () => Promise.allSettled(clients.map((c) => c.close())) }
}

/**
 * 커넥터 사용 규칙(권한 한계) 문구 — 시스템 프롬프트에 주입해 "안 되는 도구를 시도하거나
 * 재인증하라고 오안내"하는 것을 막는다(예: Gmail 커넥터는 작성 전용).
 * 바인딩된 커넥터에서만 나오므로 턴과 무관 → 캐시되는 안정 구간에 둘 것.
 */
export function connectorUsageNotes(connectorIds: string[]): string[] {
  return MCP_CONNECTORS.filter((c) => connectorIds.includes(c.id) && c.usageNote).map(
    (c) => `[${c.name} 사용 규칙] ${c.usageNote}`,
  )
}
