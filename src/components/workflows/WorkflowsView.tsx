"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Workflow as WorkflowIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { normalizeGraph } from "@/lib/workflows"
import { Loading, ErrorState } from "@/components/shared/States"

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
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          아직 워크플로우가 없어요. ‘새 워크플로우’로 시작하세요.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((w) => {
            const { nodes } = normalizeGraph(w.steps)
            return (
              <button
                key={w.id}
                onClick={() => router.push(`/workflows/${w.id}`)}
                className="hover-grow flex flex-col gap-1.5 rounded-lg border p-3 text-left"
              >
                <div className="flex items-center gap-1.5">
                  <WorkflowIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-semibold">{w.name}</span>
                </div>
                {w.description && (
                  <p className="line-clamp-1 text-xs text-muted-foreground">{w.description}</p>
                )}
                {/* 에이전트 아이콘 미리보기 — 한눈에 협력 흐름 */}
                {nodes.length > 0 && (
                  <div className="flex items-center gap-0.5 text-sm">
                    {nodes.slice(0, 5).map((n, i) => (
                      <span key={n.id} className="flex items-center">
                        {i > 0 && <span className="px-0.5 text-[10px] text-muted-foreground/50">→</span>}
                        <span title={n.agent_name}>{n.agent_icon || "🤖"}</span>
                      </span>
                    ))}
                    {nodes.length > 5 && (
                      <span className="ml-0.5 text-[10px] text-muted-foreground">+{nodes.length - 5}</span>
                    )}
                  </div>
                )}
                <div className="mt-0.5 flex items-center gap-1.5 border-t pt-1.5 text-[10px] text-muted-foreground">
                  <span>{nodes.length}단계</span>
                  <span>·</span>
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
