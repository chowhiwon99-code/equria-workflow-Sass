// 워크플로우 SSOT — 캔버스 그래프(노드 + 끈) 타입 + 직렬화/파싱 헬퍼.
// 정의(definition)만 다룬다. 실제 실행 엔진은 고도화 단계에서 이 계약을 소비한다.
// workflows.steps(jsonb)에 { nodes, edges } 객체로 저장한다(레거시 배열도 자동 변환).

/**
 * 노드 실행 후 실제 "행동"을 하는 도구(선택).
 * 실작동: webhook(HTTP POST) · save_file(결과를 파일로 저장) · notify(내 알림으로 전송).
 * youtube/figma/higgsfield 등 외부 연동은 고도화 시 추가
 * (lib/workflowTools.ts 의 카탈로그에 정의 추가 → 실행 라우트에 케이스 추가).
 */
export type WorkflowToolType = "none" | "webhook" | "save_file" | "notify"

export type WorkflowTool = {
  type: WorkflowToolType
  /** webhook: 전송할 URL (save_file/notify는 추가 설정 없음) */
  url?: string
}

/** 노드 종류 — 없거나 "agent"면 에이전트 노드(레거시 호환), "mcp_tool"이면 MCP 도구 직접 실행. */
export type WorkflowNodeKind = "agent" | "mcp_tool"

export type WorkflowNode = {
  id: string
  kind?: WorkflowNodeKind
  agent_id: string // agent 노드용 (mcp_tool 노드는 "")
  agent_name: string // 노드 라벨(에이전트명 또는 MCP 도구명)
  agent_icon?: string
  /** 이 에이전트가 하는 일 한 줄 — 노드에 표시 (agents.description 스냅샷) */
  agent_desc?: string
  /** 이 단계 추가 지시(선택) */
  note?: string
  /** 이 노드가 텍스트 생성 후 수행할 행동(선택) */
  tool?: WorkflowTool
  // ---- mcp_tool 노드 전용 ----
  mcp_server_id?: string
  mcp_tool_name?: string
  /** MCP 도구 인자(JSON 문자열). `{{input}}`은 앞 단계 출력으로 치환. 빈 값이면 {} */
  mcp_args?: string
  x: number
  y: number
}

export type WorkflowEdge = {
  id: string
  source: string // WorkflowNode.id
  target: string // WorkflowNode.id
}

export type WorkflowGraph = {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export function genId(prefix = "n"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

/**
 * 노드 배열 순서대로 선형 끈(1→2→…→n)을 재생성한다.
 * "번호가 주인" 모델: 사용자가 번호로 순서를 정하면 끈은 이 함수로 자동 연결된다.
 */
export function linearEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
  const edges: WorkflowEdge[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ id: genId("e"), source: nodes[i].id, target: nodes[i + 1].id })
  }
  return edges
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null
}
function asStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}
function asNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined
}

function asTool(v: unknown): WorkflowTool | undefined {
  const o = asObj(v)
  if (!o) return undefined
  const type = asStr(o.type)
  if (type === "webhook") return { type: "webhook", url: asStr(o.url) }
  if (type === "save_file") return { type: "save_file" }
  if (type === "notify") return { type: "notify" }
  return undefined
}

/** workflows.steps(jsonb)를 안전하게 그래프로 파싱(신규 객체 / 레거시 배열 모두 지원). */
export function normalizeGraph(raw: unknown): WorkflowGraph {
  const root = asObj(raw)

  // 신규 포맷: { nodes: [...], edges: [...] }
  if (root && Array.isArray(root.nodes)) {
    const nodes: WorkflowNode[] = (root.nodes as unknown[])
      .map((item, i): WorkflowNode | null => {
        const o = asObj(item)
        if (!o) return null
        const kind: WorkflowNodeKind = asStr(o.kind) === "mcp_tool" ? "mcp_tool" : "agent"
        const agent_id = asStr(o.agent_id) ?? ""
        const mcp_server_id = asStr(o.mcp_server_id)
        const mcp_tool_name = asStr(o.mcp_tool_name)
        // 유효성: agent 노드는 agent_id, mcp_tool 노드는 서버+도구 필수
        if (kind === "mcp_tool") {
          if (!mcp_server_id || !mcp_tool_name) return null
        } else if (!agent_id) {
          return null
        }
        return {
          id: asStr(o.id) ?? genId(),
          kind,
          agent_id,
          agent_name: asStr(o.agent_name) ?? "",
          agent_icon: asStr(o.agent_icon),
          agent_desc: asStr(o.agent_desc),
          note: asStr(o.note) || undefined,
          tool: asTool(o.tool),
          mcp_server_id,
          mcp_tool_name,
          mcp_args: asStr(o.mcp_args),
          x: asNum(o.x) ?? 40 + (i % 5) * 180,
          y: asNum(o.y) ?? 40 + Math.floor(i / 5) * 130,
        }
      })
      .filter((n): n is WorkflowNode => n !== null)

    const ids = new Set(nodes.map((n) => n.id))
    const edges: WorkflowEdge[] = Array.isArray(root.edges)
      ? (root.edges as unknown[])
          .map((item): WorkflowEdge | null => {
            const o = asObj(item)
            if (!o) return null
            const source = asStr(o.source)
            const target = asStr(o.target)
            if (!source || !target || !ids.has(source) || !ids.has(target)) return null
            return { id: asStr(o.id) ?? genId("e"), source, target }
          })
          .filter((e): e is WorkflowEdge => e !== null)
      : []

    return { nodes, edges }
  }

  // 레거시 포맷: [{ id, agent_id, agent_name, note }] → 가로로 배치 + 순차 연결
  if (Array.isArray(raw)) {
    const nodes: WorkflowNode[] = (raw as unknown[])
      .map((item, i): WorkflowNode | null => {
        const o = asObj(item)
        if (!o) return null
        const agent_id = asStr(o.agent_id)
        if (!agent_id) return null
        return {
          id: asStr(o.id) ?? genId(),
          agent_id,
          agent_name: asStr(o.agent_name) ?? "",
          agent_icon: asStr(o.agent_icon),
          agent_desc: asStr(o.agent_desc),
          note: asStr(o.note) || undefined,
          x: 60 + i * 200,
          y: 120,
        }
      })
      .filter((n): n is WorkflowNode => n !== null)

    const edges: WorkflowEdge[] = []
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({ id: genId("e"), source: nodes[i].id, target: nodes[i + 1].id })
    }
    return { nodes, edges }
  }

  return { nodes: [], edges: [] }
}

/**
 * 끈(edges)을 따라 실행 순서를 위상정렬한다.
 * - 들어오는 끈이 없는 노드(시작점)부터, 끈 방향대로 진행.
 * - 사이클이 있으면 ok=false (실행 불가).
 * - 끈이 전혀 없으면 노드를 x좌표(왼→오) 순으로 정렬해 반환(단순 순차).
 */
export function topoOrder(graph: WorkflowGraph): { ok: boolean; order: WorkflowNode[]; reason?: string } {
  const { nodes, edges } = graph
  if (nodes.length === 0) return { ok: false, order: [], reason: "노드가 없습니다." }

  if (edges.length === 0) {
    const order = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y)
    return { ok: true, order }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const indeg = new Map(nodes.map((n) => [n.id, 0]))
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    adj.get(e.source)!.push(e.target)
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
  }

  // 시작점: indegree 0 (여러 개면 x좌표 순). Kahn's algorithm.
  const queue = nodes
    .filter((n) => (indeg.get(n.id) ?? 0) === 0)
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((n) => n.id)
  const order: WorkflowNode[] = []
  const seen = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    order.push(byId.get(id)!)
    const next = (adj.get(id) ?? []).slice().sort((a, b) => {
      const na = byId.get(a)!, nb = byId.get(b)!
      return na.x - nb.x || na.y - nb.y
    })
    for (const t of next) {
      indeg.set(t, (indeg.get(t) ?? 0) - 1)
      if ((indeg.get(t) ?? 0) === 0) queue.push(t)
    }
  }

  if (order.length !== nodes.length) {
    return { ok: false, order, reason: "연결이 순환(고리)하고 있어 순서를 정할 수 없습니다." }
  }
  return { ok: true, order }
}
