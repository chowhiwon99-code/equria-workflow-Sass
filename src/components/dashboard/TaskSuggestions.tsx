"use client"

import { useState } from "react"
import { Sparkles, Plus, X, Loader2, RefreshCw, CheckCheck } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { mustOk } from "@/lib/supabase/mustOk"
import { Surface } from "@/components/shared/Surface"
import { Button } from "@/components/ui/button"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"

/**
 * AI 작업 제안(세션41 대표 요청 — flex 스타일) — 연동 소스(프로젝트·할 일·캘린더·알림·워크플로우·Gmail)를
 * AI가 읽고 우선순위·출처와 함께 해야 할 일을 제안. 사용자가 제목을 고쳐서 [추가] = 오늘 할 일(personal_tasks) 등록.
 * 수동 새로고침(자동 호출 없음 — AI 비용은 사용자가 누를 때만). 무시(×)·전체 추가 지원.
 */

type Suggestion = {
  title: string
  reason: string
  priority: "urgent" | "high" | "medium"
  source_type: string
  source_label: string
  suggested_due: string | null
}

const PRIORITY = {
  urgent: { label: "긴급", cls: "bg-rose-500/10 text-rose-500" },
  high: { label: "높음", cls: "bg-warning-bg text-warning-foreground" },
  medium: { label: "중간", cls: "bg-info-bg text-info" },
} as const
const ORDER: Suggestion["priority"][] = ["urgent", "high", "medium"]

export function TaskSuggestions() {
  const supabase = createClient()
  const me = useCurrentUserId()
  const [items, setItems] = useState<Suggestion[] | null>(null) // null = 아직 안 받음
  const [sourcesUsed, setSourcesUsed] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [addedAll, setAddedAll] = useState(false)

  const fetchSuggestions = async () => {
    setLoading(true)
    setAddedAll(false)
    try {
      const res = await fetch("/api/task-suggestions", { method: "POST" })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "실패")
      setItems(j.suggestions ?? [])
      setSourcesUsed(j.sources_used ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "작업 제안을 받지 못했어요.")
    } finally {
      setLoading(false)
    }
  }

  const addOne = async (s: Suggestion) => {
    if (!me) return
    try {
      await mustOk(supabase.from("personal_tasks").insert({ user_id: me, title: s.title, due_date: s.suggested_due }))
      setItems((prev) => (prev ?? []).filter((x) => x !== s))
      toast.success("오늘 할 일에 추가했어요.")
      window.dispatchEvent(new Event("equria:reload")) // TodayTasks 갱신
    } catch {
      toast.error("추가에 실패했어요.")
    }
  }

  const addAll = async () => {
    if (!me || !items?.length) return
    try {
      await mustOk(supabase.from("personal_tasks").insert(items.map((s) => ({ user_id: me, title: s.title, due_date: s.suggested_due }))))
      setItems([])
      setAddedAll(true)
      toast.success(`${items.length}개를 오늘 할 일에 추가했어요.`)
      window.dispatchEvent(new Event("equria:reload"))
    } catch {
      toast.error("추가에 실패했어요.")
    }
  }

  const dismiss = (s: Suggestion) => setItems((prev) => (prev ?? []).filter((x) => x !== s))
  const editTitle = (s: Suggestion, title: string) => setItems((prev) => (prev ?? []).map((x) => (x === s ? { ...x, title } : x)))

  return (
    <Surface padding="none" className="flex min-h-0 flex-col rounded-xl p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" /> 작업 제안
          {sourcesUsed.length > 0 && <span className="text-xs font-normal text-muted-foreground">· {sourcesUsed.join("·")} 기반</span>}
        </h2>
        <div className="flex items-center gap-1.5">
          {items && items.length > 0 && (
            <Button size="sm" variant="outline" onClick={addAll}>
              <CheckCheck className="size-3.5" /> 전체 추가
            </Button>
          )}
          <Button size="sm" variant={items ? "outline" : "default"} onClick={fetchSuggestions} disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : items ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />}
            {items ? "새로 제안" : "제안 받기"}
          </Button>
        </div>
      </div>

      {items === null ? (
        <p className="py-3 text-sm text-muted-foreground">
          프로젝트·할 일·캘린더·알림{`·`}Gmail(연동 시)을 AI가 읽고 지금 해야 할 일을 우선순위·출처와 함께 제안해요.
        </p>
      ) : items.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">{addedAll ? "전부 오늘 할 일로 옮겼어요." : "지금은 새로 제안할 일이 없어요. 잘 하고 계신 거예요."}</p>
      ) : (
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {ORDER.filter((p) => items.some((s) => s.priority === p)).map((p) => (
            <div key={p}>
              <p className={cn("mb-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", PRIORITY[p].cls)}>
                {PRIORITY[p].label} {items.filter((s) => s.priority === p).length}
              </p>
              <div className="flex flex-col gap-1.5">
                {items
                  .filter((s) => s.priority === p)
                  .map((s, i) => (
                    <div key={`${p}-${i}-${s.source_label}`} className="group rounded-lg border bg-background px-2.5 py-2">
                      <div className="flex items-start gap-1.5">
                        {/* 제목 인라인 수정 가능(사용자가 고쳐서 등록) */}
                        <input
                          value={s.title}
                          onChange={(e) => editTitle(s, e.target.value)}
                          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none focus:underline"
                        />
                        <button onClick={() => addOne(s)} className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-primary" title="오늘 할 일에 추가">
                          <Plus className="size-3.5" />
                        </button>
                        <button onClick={() => dismiss(s)} className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive" title="무시">
                          <X className="size-3.5" />
                        </button>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{s.reason}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5">출처 · {s.source_label}</span>
                        {s.suggested_due && <span className="tabular-nums">기한 {s.suggested_due}</span>}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Surface>
  )
}
