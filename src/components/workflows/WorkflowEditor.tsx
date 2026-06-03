"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Play, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { useUndo } from "@/components/undo/UndoProvider"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { BackLink } from "@/components/shared/BackLink"
import { fieldClass } from "@/components/shared/Modal"
import { WorkflowCanvas, type NodeRunState } from "@/components/workflows/WorkflowCanvas"
import {
  normalizeGraph,
  genId,
  topoOrder,
  linearEdges,
  type WorkflowGraph,
  type WorkflowToolType,
} from "@/lib/workflows"
import { WORKFLOW_TOOLS } from "@/lib/workflowTools"

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
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [graph, setGraph] = useState<WorkflowGraph>({ nodes: [], edges: [] })
  const [agents, setAgents] = useState<AgentOpt[]>([])
  const [pickAgent, setPickAgent] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  const load = useCallback(async () => {
    const [{ data: wf }, { data: ag }] = await Promise.all([
      supabase.from("workflows").select("name, description, steps, is_active, is_public").eq("id", id).maybeSingle(),
      supabase
        .from("agents")
        .select("id, name, icon, description")
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
    ])
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
    setLoading(false)
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

  const addNode = () => {
    const a = agents.find((x) => x.id === pickAgent)
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
    setPickAgent("")
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

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null

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

  if (loading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>
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
          {isPublic ? "팀 공유됨 — 다른 직원이 보고 실행할 수 있어요(수정은 나만)" : "나만 사용 (체크하면 팀에 공유)"}
        </span>
      </label>

      {/* 에이전트 추가 툴바 */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={cn(fieldClass, "max-w-xs")}
          value={pickAgent}
          onChange={(e) => setPickAgent(e.target.value)}
        >
          <option value="">에이전트 선택…</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon} {a.name}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" onClick={addNode} disabled={!pickAgent}>
          <Plus /> 노드 추가
        </Button>
        <span className="text-xs text-muted-foreground">
          노드를 드래그해 배치하고, 오른쪽 점을 끌어 다음 노드와 연결하세요.
        </span>
      </div>

      {/* 캔버스 + 선택 노드 패널 */}
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <WorkflowCanvas
            graph={graph}
            onChange={setGraph}
            selectedId={selectedId}
            onSelect={setSelectedId}
            runStates={runStates}
            readOnly={running}
          />
        </div>
        {selected && (
          <aside className="flex w-60 shrink-0 flex-col gap-2 rounded-xl border p-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">{selected.agent_icon || "🤖"}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{selected.agent_name}</span>
            </div>
            {selected.agent_desc && (
              <p className="text-xs text-muted-foreground">{selected.agent_desc}</p>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              이 단계 지시(선택)
              <textarea
                className={cn(fieldClass, "min-h-[80px] resize-y py-1.5")}
                value={selected.note ?? ""}
                onChange={(e) => setNodeNote(selected.id, e.target.value)}
                placeholder="예: 앞 단계 결과를 요약해서…"
              />
            </label>

            {/* 도구(행동) — 결과 생성 후 실제 동작 */}
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

      {/* 최근 실행 이력 — 새로고침 후에도 남음 */}
      {runs.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl border p-3">
          <span className="text-sm font-semibold">최근 실행</span>
          <div className="flex flex-col divide-y">
            {runs.map((r) => {
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
                          ? "bg-green-500"
                          : r.status === "error"
                            ? "bg-destructive"
                            : "bg-muted-foreground animate-pulse"
                      )}
                    />
                    <span className="text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    <span className="text-muted-foreground">· {r.node_count}단계</span>
                    {r.duration_ms != null && (
                      <span className="text-muted-foreground">· {(r.duration_ms / 1000).toFixed(1)}s</span>
                    )}
                    {r.status === "error" && <span className="text-destructive">· 오류</span>}
                    <span className="ml-auto text-muted-foreground">{open ? "▲" : "▼"}</span>
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
