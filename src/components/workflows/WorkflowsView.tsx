"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Workflow as WorkflowIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { normalizeGraph } from "@/lib/workflows"
import { Loading, ErrorState } from "@/components/shared/States"
import { renderAgentIcon } from "@/components/agents/AgentIcon"

type WorkflowRow = {
  id: string
  name: string
  description: string | null
  steps: unknown
  run_count: number
}

export function WorkflowsView() {
  const supabase = createClient()
  const router = useRouter()
  const [rows, setRows] = useState<WorkflowRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("workflows")
        .select("id, name, description, steps, run_count")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
      if (error) throw error
      setRows((data as WorkflowRow[]) ?? [])
      setError(null)
    } catch {
      setError("워크플로우를 불러오지 못했어요.")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  // 소프트삭제 Undo/Redo 반영
  useEffect(() => {
    const h = () => load()
    window.addEventListener("equria:reload", h)
    return () => window.removeEventListener("equria:reload", h)
  }, [load])

  const create = async () => {
    if (creating) return
    setCreating(true)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      setCreating(false)
      return
    }
    const { data, error } = await supabase
      .from("workflows")
      .insert({ name: "새 워크플로우", description: null, steps: [], created_by: auth.user.id })
      .select("id")
      .single()
    setCreating(false)
    if (error || !data) return
    router.push(`/workflows/${data.id}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">워크플로우</h1>
          <p className="text-sm text-muted-foreground">
            에이전트를 순서대로 엮어 실행하면 앞 단계 결과가 다음 단계로 이어집니다.
          </p>
        </div>
        <Button size="sm" onClick={create} disabled={creating}>
          <Plus /> 새 워크플로우
        </Button>
      </div>

      {loading ? (
        <Loading rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { setError(null); load() }} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/40 px-4 py-12 text-center">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary/8 text-primary">
            <WorkflowIcon className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">
            아직 워크플로우가 없어요. ‘새 워크플로우’로 시작하세요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((w) => {
            const { nodes } = normalizeGraph(w.steps)
            return (
              <button
                key={w.id}
                onClick={() => router.push(`/workflows/${w.id}`)}
                className="group flex flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary">
                    <WorkflowIcon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-base font-semibold">{w.name}</span>
                </div>
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {w.description || "설명 없음"}
                </p>
                {/* 에이전트 협력 흐름 — 아이콘 칩 + 화살표 */}
                <div className="flex min-h-7 flex-wrap items-center gap-1 text-sm">
                  {nodes.length > 0 ? (
                    <>
                      {nodes.slice(0, 5).map((n, i) => (
                        <span key={n.id} className="flex items-center gap-1">
                          {i > 0 && <span className="text-muted-foreground/40">→</span>}
                          <span
                            className="grid size-7 place-items-center rounded-lg bg-muted"
                            title={n.agent_name}
                          >
                            {renderAgentIcon(n.agent_icon || "lucide:Bot", "size-4")}
                          </span>
                        </span>
                      ))}
                      {nodes.length > 5 && (
                        <span className="ml-0.5 text-xs text-muted-foreground">+{nodes.length - 5}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground/60">아직 단계가 없어요</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 border-t pt-2.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{nodes.length}</span>
                  <span>단계</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>실행 {w.run_count}회</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
