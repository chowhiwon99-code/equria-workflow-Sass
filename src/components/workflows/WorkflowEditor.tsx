"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Play, Trash2, Loader2, ChevronDown, Plug } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { useUndo } from "@/components/undo/UndoProvider"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { BackLink } from "@/components/shared/BackLink"
import { Loading, ErrorState } from "@/components/shared/States"
import { fieldClass } from "@/components/shared/Modal"
import { WorkflowCanvas, type NodeRunState } from "@/components/workflows/WorkflowCanvas"
import { renderAgentIcon, isLucideIcon } from "@/components/agents/AgentIcon"
import {
  normalizeGraph,
  genId,
  topoOrder,
  linearEdges,
  type WorkflowGraph,
  type WorkflowToolType,
} from "@/lib/workflows"
import { WORKFLOW_TOOLS } from "@/lib/workflowTools"
import { StepPicker } from "@/components/workflows/StepPicker"

type AgentOpt = { id: string; name: string; icon: string; description: string | null }

type RunNodeResult = {
  nodeId: string
  agent_name: string
  status: "done" | "error"
  output?: string
  toolNote?: string
  error?: string
}
type RunRow = {
  id: string
  status: string
  input: string | null
  final_output: string | null
  error: string | null
  node_results: RunNodeResult[]
  node_count: number
  duration_ms: number | null
  created_at: string
}

export function WorkflowEditor({ id }: { id: string }) {
  const supabase = createClient()
  const router = useRouter()
  const { push } = useUndo()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [graph, setGraph] = useState<WorkflowGraph>({ nodes: [], edges: [] })
  const [agents, setAgents] = useState<AgentOpt[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false) // "단계 추가" 통합 피커
  // MCP 도구 노드 — 연결된 MCP 서버·도구 목록(피커에 노출)
  const [mcpServers, setMcpServers] = useState<{ id: string; name: string }[]>([])
  const [mcpTools, setMcpTools] = useState<Record<string, { name: string; description: string | null }[]>>({})

  // 실행 상태
  const [running, setRunning] = useState(false)
  const [runInput, setRunInput] = useState("")
  const [runStates, setRunStates] = useState<Record<string, NodeRunState>>({})
  const [nodeOutputs, setNodeOutputs] = useState<Record<string, string>>({})
  const [nodeToolNotes, setNodeToolNotes] = useState<Record<string, string>>({})
  const [finalOutput, setFinalOutput] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  // 실행 이력(workflow_runs) — 새로고침 후에도 조회 가능
  const [runs, setRuns] = useState<RunRow[]>([])
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [showAllRuns, setShowAllRuns] = useState(false) // 최근 실행 기본 3개만 — 목록 도배 방지

  const load = useCallback(async () => {
    try {
      const [{ data: wf, error: wfErr }, { data: ag, error: agErr }] = await Promise.all([
        supabase.from("workflows").select("name, description, steps, is_active, is_public").eq("id", id).maybeSingle(),
        supabase
          .from("agents")
          .select("id, name, icon, description")
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
      ])
      if (wfErr) throw wfErr
      if (agErr) throw agErr
      if (!wf || wf.is_active === false) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setName(wf.name ?? "")
      setDescription(wf.description ?? "")
      setIsPublic(wf.is_public ?? false)
      setGraph(normalizeGraph(wf.steps))
      setAgents((ag as AgentOpt[]) ?? [])
      setLoadError(null)
      setLoading(false)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "워크플로우를 불러오지 못했어요.")
      setLoading(false)
    }
  }, [supabase, id])

  const loadRuns = useCallback(async () => {
    const { data } = await supabase
      .from("workflow_runs")
      .select("id, status, input, final_output, error, node_results, node_count, duration_ms, created_at")
      .eq("workflow_id", id)
      .order("created_at", { ascending: false })
      .limit(10)
    setRuns((data as unknown as RunRow[]) ?? [])
  }, [supabase, id])

  useEffect(() => {
    load()
    loadRuns()
  }, [load, loadRuns])

  // 연결된 MCP 서버·도구(캐시된 mcp_tools) — MCP 노드 픽커용. 실패해도 에디터는 정상.
  useEffect(() => {
    fetch("/api/mcp/servers")
      .then((r) => (r.ok ? r.json() : { servers: [], tools: {} }))
      .then((j: { servers?: { id: string; name: string; is_active: boolean }[]; tools?: Record<string, { name: string; description: string | null }[]> }) => {
        setMcpServers((j.servers ?? []).filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name })))
        setMcpTools(j.tools ?? {})
      })
      .catch(() => {})
  }, [])

  const addNode = (agentId: string) => {
    const a = agents.find((x) => x.id === agentId)
    if (!a) return
    setGraph((g) => {
      // 새 노드는 실행 순서의 맨 끝에 붙이고, 끈을 선형으로 자동 재연결.
      const cur = topoOrder(g)
      const ordered = cur.ok ? [...cur.order] : [...g.nodes]
      const last = g.nodes[g.nodes.length - 1]
      const newNode = {
        id: genId(),
        agent_id: a.id,
        agent_name: a.name,
        agent_icon: a.icon,
        agent_desc: a.description ?? undefined,
        note: "",
        x: last ? last.x + 180 : 40,
        y: last ? last.y : 40,
      }
      const nodes = [...ordered, newNode]
      return { nodes, edges: linearEdges(nodes) }
    })
  }

  // MCP 도구 노드 추가 — 에이전트 노드와 동일하게 맨 끝에 붙이고 선형 재연결.
  const addMcpNode = (serverId: string, toolName: string) => {
    const srv = mcpServers.find((s) => s.id === serverId)
    if (!srv || !toolName) return
    setGraph((g) => {
      const cur = topoOrder(g)
      const ordered = cur.ok ? [...cur.order] : [...g.nodes]
      const last = g.nodes[g.nodes.length - 1]
      const newNode = {
        id: genId(),
        kind: "mcp_tool" as const,
        agent_id: "",
        agent_name: toolName,
        agent_desc: `MCP · ${srv.name}`,
        note: "",
        mcp_server_id: srv.id,
        mcp_tool_name: toolName,
        mcp_args: "",
        x: last ? last.x + 180 : 40,
        y: last ? last.y : 40,
      }
      const nodes = [...ordered, newNode]
      return { nodes, edges: linearEdges(nodes) }
    })
  }

  const removeNode = (nodeId: string) => {
    setGraph((g) => ({
      nodes: g.nodes.filter((n) => n.id !== nodeId),
      edges: g.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }))
    setSelectedId((s) => (s === nodeId ? null : s))
  }

  const setNodeNote = (nodeId: string, note: string) =>
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, note } : n)) }))

  const setNodeToolType = (nodeId: string, type: WorkflowToolType) =>
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, tool: type === "none" ? undefined : { type, url: n.tool?.url ?? "" } }
          : n
      ),
    }))

  const setNodeToolUrl = (nodeId: string, url: string) =>
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) =>
        n.id === nodeId && n.tool ? { ...n, tool: { ...n.tool, url } } : n
      ),
    }))

  const setNodeMcpArgs = (nodeId: string, mcp_args: string) =>
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, mcp_args } : n)) }))

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null
  // MCP 인자 JSON 사전 검증 — {{input}}은 실행 시 이스케이프 치환되므로 검증에선 더미로 대체.
  const mcpArgsInvalid = (() => {
    if (selected?.kind !== "mcp_tool") return false
    const rawArgs = (selected.mcp_args ?? "").trim()
    if (!rawArgs) return false
    try {
      JSON.parse(rawArgs.replace(/\{\{\s*input\s*\}\}/g, "x"))
      return false
    } catch {
      return true
    }
  })()
  // 노드 아이콘을 에이전트의 현재 아이콘(lucide)으로 통일(스냅샷 이모지 대신). 맵에 없으면 lucide:Bot.
  const agentIcons: Record<string, string> = {}
  for (const a of agents) agentIcons[a.id] = a.icon
  const resolveNodeIcon = (agentId: string, snapshot?: string) =>
    agentIcons[agentId] || (isLucideIcon(snapshot ?? "") ? (snapshot as string) : "lucide:Bot")

  const savedRef = useRef(false)
  const save = async (): Promise<boolean> => {
    if (!name.trim() || saving) return false
    setSaving(true)
    try {
      await mustOk(
        supabase
          .from("workflows")
          .update({
            name: name.trim(),
            description: description.trim() || null,
            steps: graph,
            is_public: isPublic,
          })
          .eq("id", id)
      )
      savedRef.current = true
      toast.success("저장했어요.")
      window.dispatchEvent(new Event("equria:reload"))
      return true
    } catch {
      toast.error("저장에 실패했어요.")
      return false
    } finally {
      setSaving(false)
    }
  }

  const run = async () => {
    if (running) return
    const topo = topoOrder(graph)
    if (!topo.ok) {
      toast.error(topo.reason ?? "실행할 수 없습니다.")
      return
    }
    // 실행은 저장된 정의를 사용 → 먼저 저장
    const ok = await save()
    if (!ok) return

    setRunning(true)
    setRunError(null)
    setFinalOutput(null)
    setNodeOutputs({})
    setNodeToolNotes({})
    setRunStates(Object.fromEntries(graph.nodes.map((n) => [n.id, "idle" as NodeRunState])))

    try {
      const res = await fetch(`/api/workflows/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: runInput }),
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error ?? `실행 실패 (${res.status})`)
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          const ev = JSON.parse(line) as {
            type: string
            nodeId?: string
            status?: NodeRunState
            output?: string
            toolNote?: string
            error?: string
          }
          if (ev.type === "node" && ev.nodeId) {
            setRunStates((s) => ({ ...s, [ev.nodeId!]: ev.status ?? "idle" }))
            if (ev.status === "done" && ev.output != null)
              setNodeOutputs((o) => ({ ...o, [ev.nodeId!]: ev.output! }))
            if (ev.toolNote) setNodeToolNotes((o) => ({ ...o, [ev.nodeId!]: ev.toolNote! }))
          } else if (ev.type === "done") {
            setFinalOutput(ev.output ?? "")
          } else if (ev.type === "error") {
            setRunError(ev.error ?? "실행 중 오류")
          }
        }
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "실행 중 오류")
    } finally {
      setRunning(false)
      loadRuns()
    }
  }

  const remove = async () => {
    push({
      label: "워크플로우 삭제",
      undo: async () => {
        await mustOk(supabase.from("workflows").update({ is_active: true }).eq("id", id))
        window.dispatchEvent(new Event("equria:reload"))
      },
      redo: async () => {
        await mustOk(supabase.from("workflows").update({ is_active: false }).eq("id", id))
        window.dispatchEvent(new Event("equria:reload"))
      },
    })
    await mustOk(supabase.from("workflows").update({ is_active: false }).eq("id", id))
    window.dispatchEvent(new Event("equria:reload"))
    router.push("/workflows")
  }

  if (loading) return <Loading rows={5} />
  if (loadError)
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/workflows" label="워크플로우" />
        <ErrorState
          message={loadError}
          onRetry={() => {
            setLoadError(null)
            setLoading(true)
            load()
          }}
        />
      </div>
    )
  if (notFound)
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/workflows" label="워크플로우" />
        <p className="text-sm text-muted-foreground">워크플로우를 찾을 수 없어요.</p>
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/workflows" label="워크플로우" />

      {/* 헤더 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-1 flex-wrap gap-3">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted-foreground">이름 *</span>
            <input
              className={fieldClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 신규 캠페인 콘텐츠 생성"
            />
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted-foreground">설명</span>
            <input
              className={fieldClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="이 워크플로우가 하는 일"
            />
          </label>
        </div>
        <Button size="sm" onClick={save} disabled={!name.trim() || saving}>
          {saving ? "저장 중…" : "저장"}
        </Button>
      </div>

      {/* 공유 토글 */}
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="size-4"
        />
        <span className="text-muted-foreground">
          {isPublic ? "팀에 공유됨 — 다른 직원이 보고 실행할 수 있어요(수정은 나만)" : "나만 사용 중 — 체크하면 팀 전체가 보고 실행할 수 있어요"}
        </span>
      </label>

      {/* 단계 추가 — 에이전트/도구를 하나의 피커에서 선택(순서 맨 끝에 자동 연결) */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setPickerOpen(true)}>
          <Plus /> 단계 추가
        </Button>
        <span className="text-xs text-muted-foreground">
          추가한 순서대로 <b className="font-medium text-foreground">자동 연결</b>돼요. (고급: 캔버스에서 노드를 드래그해 재배치·재연결)
        </span>
      </div>
      {pickerOpen && (
        <StepPicker
          agents={agents}
          mcpServers={mcpServers}
          mcpTools={mcpTools}
          onPickAgent={addNode}
          onPickMcp={addMcpNode}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* 캔버스 + 선택 노드 패널 — 모바일에선 아래로 쌓임(md+ 나란히) */}
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="min-w-0 flex-1">
          <WorkflowCanvas
            graph={graph}
            onChange={setGraph}
            selectedId={selectedId}
            onSelect={setSelectedId}
            runStates={runStates}
            readOnly={running}
            agentIcons={agentIcons}
          />
        </div>
        {selected && (
          <aside className="flex w-full shrink-0 flex-col gap-2 rounded-xl border p-3 md:w-60">
            <div className="flex items-center gap-2">
              <span className="text-lg">
                {selected.kind === "mcp_tool" ? (
                  <Plug className="size-5 text-primary" />
                ) : (
                  renderAgentIcon(resolveNodeIcon(selected.agent_id, selected.agent_icon), "size-5")
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{selected.agent_name}</span>
            </div>
            {selected.agent_desc && (
              <p className="text-xs text-muted-foreground">{selected.agent_desc}</p>
            )}
            {/* MCP 도구 노드 — 인자(JSON) 편집. 에이전트 노드 — 지시·완료 후 행동. */}
            {selected.kind === "mcp_tool" && (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                도구 인자 (JSON)
                <textarea
                  className={cn(fieldClass, "min-h-[96px] resize-y py-1.5 font-mono text-[11px]")}
                  value={selected.mcp_args ?? ""}
                  onChange={(e) => setNodeMcpArgs(selected.id, e.target.value)}
                  placeholder={'{"query": "{{input}}"}'}
                />
                <span className="text-[10px] text-muted-foreground/70">
                  {"{{input}}"}은 앞 단계 출력으로 치환돼요. 빈칸이면 인자 없이 호출해요.
                </span>
                {mcpArgsInvalid && <span className="text-[10px] text-destructive">JSON 형식이 올바르지 않아요.</span>}
              </label>
            )}
            {selected.kind !== "mcp_tool" && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              이 단계 지시(선택)
              <textarea
                className={cn(fieldClass, "min-h-[80px] resize-y py-1.5")}
                value={selected.note ?? ""}
                onChange={(e) => setNodeNote(selected.id, e.target.value)}
                placeholder="예: 앞 단계 결과를 요약해서…"
              />
            </label>
            )}

            {/* 도구(행동) — 결과 생성 후 실제 동작 (에이전트 노드 전용 — MCP 노드에선 실행되지 않아 숨김) */}
            {selected.kind !== "mcp_tool" && (
            <>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              완료 후 행동
              <select
                className={fieldClass}
                value={selected.tool?.type ?? "none"}
                onChange={(e) => setNodeToolType(selected.id, e.target.value as WorkflowToolType)}
              >
                {WORKFLOW_TOOLS.map((t, i) => (
                  <option key={`${t.type}-${i}`} value={t.type} disabled={!t.enabled}>
                    {t.emoji} {t.label}
                    {!t.enabled ? " (준비 중)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {selected.tool?.type === "webhook" && (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                웹훅 URL
                <input
                  className={fieldClass}
                  value={selected.tool.url ?? ""}
                  onChange={(e) => setNodeToolUrl(selected.id, e.target.value)}
                  placeholder="https://hooks.zapier.com/…"
                />
                <span className="text-[10px] text-muted-foreground/70">
                  결과를 이 주소로 POST합니다. Make·Zapier·Slack·n8n 웹훅에 연결해 유튜브 업로드 등으로 분기하세요.
                </span>
              </label>
            )}
            {(selected.tool?.type === "save_file" || selected.tool?.type === "notify") && (
              <p className="text-[10px] text-muted-foreground/70">
                {selected.tool.type === "save_file"
                  ? "이 단계 결과를 .md 파일로 ‘파일 관리’에 저장합니다."
                  : "이 단계 결과를 내 알림으로 보냅니다."}
              </p>
            )}
            </>
            )}
            {nodeToolNotes[selected.id] && (
              <p className="rounded-md bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                🔗 {nodeToolNotes[selected.id]}
              </p>
            )}
            {nodeOutputs[selected.id] && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">이 단계 결과</span>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed">
                  {nodeOutputs[selected.id]}
                </pre>
              </div>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => removeNode(selected.id)}
              className="justify-start text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" /> 노드 삭제
            </Button>
          </aside>
        )}
      </div>

      {/* 실행 패널 */}
      <div className="flex flex-col gap-2 rounded-xl border p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">실행</span>
          <span className="text-xs text-muted-foreground">
            끈 순서대로 에이전트를 호출하고 결과를 다음 단계로 넘깁니다.
          </span>
        </div>
        <textarea
          className={cn(fieldClass, "min-h-[60px] resize-y py-1.5")}
          value={runInput}
          onChange={(e) => setRunInput(e.target.value)}
          placeholder="시작 입력(선택) — 예: 신제품 '수분크림' 출시. 타깃 20대 여성."
          disabled={running}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={run} disabled={running || graph.nodes.length === 0}>
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {running ? "실행 중…" : "워크플로우 실행"}
          </Button>
          {runError && <span className="text-xs text-destructive">{runError}</span>}
        </div>
        {finalOutput != null && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">최종 결과</span>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-[12px] leading-relaxed">
              {finalOutput || "(빈 결과)"}
            </pre>
          </div>
        )}
      </div>

      {/* 최근 실행 이력 — 새로고침 후에도 남음. 기본 3개 + 더 보기(도배 방지) */}
      {runs.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">최근 실행</span>
            {runs.length > 3 && (
              <button
                onClick={() => setShowAllRuns((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {showAllRuns ? "접기" : `전체 보기 (${runs.length})`}
              </button>
            )}
          </div>
          <div className="flex flex-col divide-y">
            {(showAllRuns ? runs : runs.slice(0, 3)).map((r) => {
              const open = openRunId === r.id
              return (
                <div key={r.id} className="py-1.5">
                  <button
                    onClick={() => setOpenRunId(open ? null : r.id)}
                    className="flex w-full items-center gap-2 text-left text-xs"
                  >
                    <span
                      className={cn(
                        "inline-block size-2 shrink-0 rounded-full",
                        r.status === "done"
                          ? "bg-success"
                          : r.status === "error"
                            ? "bg-destructive"
                            : "bg-muted-foreground animate-pulse"
                      )}
                    />
                    <span className="text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    {r.duration_ms != null && (
                      <span className="text-muted-foreground">· {(r.duration_ms / 1000).toFixed(1)}s</span>
                    )}
                    {r.status === "error" && <span className="text-destructive">· 오류</span>}
                    <ChevronDown
                      className={cn(
                        "ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180"
                      )}
                    />
                  </button>
                  {open && (
                    <div className="mt-2 flex flex-col gap-2">
                      {r.input && (
                        <div className="text-[11px]">
                          <span className="font-medium text-muted-foreground">입력</span>
                          <pre className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2">
                            {r.input}
                          </pre>
                        </div>
                      )}
                      {(r.node_results ?? []).map((n, i) => (
                        <div key={`${n.nodeId}-${i}`} className="text-[11px]">
                          <span className="font-medium text-muted-foreground">
                            {i + 1}. {n.agent_name || "단계"}
                            {n.status === "error" ? " ⚠️" : ""}
                          </span>
                          {n.toolNote && <p className="text-muted-foreground/70">🔗 {n.toolNote}</p>}
                          <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2">
                            {n.error ?? n.output ?? ""}
                          </pre>
                        </div>
                      ))}
                      {r.error && <p className="text-[11px] text-destructive">{r.error}</p>}
                      {r.final_output && (
                        <div className="text-[11px]">
                          <span className="font-medium text-muted-foreground">최종 결과</span>
                          <pre className="mt-0.5 max-h-52 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2">
                            {r.final_output}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex border-t pt-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={remove}
          className="text-destructive hover:text-destructive"
        >
          워크플로우 삭제
        </Button>
      </div>
    </div>
  )
}
