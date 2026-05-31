"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Workflow as WorkflowIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { normalizeSteps } from "@/lib/workflows"

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

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("workflows")
      .select("id, name, description, steps, run_count")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
    setRows((data as WorkflowRow[]) ?? [])
    setLoading(false)
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
            에이전트를 순서대로 엮어 반복 업무를 정의해 두세요. (실행 기능은 곧 제공됩니다)
          </p>
        </div>
        <Button size="sm" onClick={create} disabled={creating}>
          <Plus /> 새 워크플로우
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          아직 워크플로우가 없어요. ‘새 워크플로우’로 시작하세요.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((w) => {
            const steps = normalizeSteps(w.steps)
            return (
              <button
                key={w.id}
                onClick={() => router.push(`/workflows/${w.id}`)}
                className="hover-grow flex flex-col gap-2 rounded-lg border p-4 text-left"
              >
                <div className="flex items-center gap-2">
                  <WorkflowIcon className="size-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{w.name}</span>
                </div>
                {w.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{w.description}</p>
                )}
                <div className="mt-1 flex items-center gap-2 border-t pt-2 text-[11px] text-muted-foreground">
                  <span>{steps.length}단계</span>
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
