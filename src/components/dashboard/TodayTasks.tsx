"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { ListTodo, Plus, Trash2, Loader2, Check } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import type { Tables } from "@/lib/supabase/types"

type Task = Tables<"personal_tasks">

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function dueLabel(due: string): { text: string; overdue: boolean } {
  const today = todayStr()
  const overdue = due < today
  const text = due === today ? "오늘" : due.slice(5).replace("-", ".")
  return { text, overdue }
}

/**
 * 대시보드 "오늘 할 일" — 직원 각자의 개인 체크리스트(본인만 열람·편집, personal_tasks 본인전용 RLS).
 * AnnouncementsBoard 패턴 복제(load + realtime + run). 시각 알림은 2차(스케줄러)에서 추가.
 */
export function TodayTasks() {
  const supabase = createClient()
  const me = useCurrentUserId()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState("")
  const [due, setDue] = useState("")
  const submitting = useRef(false) // 중복 추가 방지(한글 IME Enter 두 번·연타)

  const load = useCallback(async () => {
    if (!me) return setLoading(false)
    const { data } = await supabase
      .from("personal_tasks")
      .select("*")
      .order("done", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
    setTasks((data as Task[]) ?? [])
    setLoading(false)
  }, [supabase, me])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    if (!me) return
    const ch = supabase
      .channel("today-tasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "personal_tasks", filter: `user_id=eq.${me}` },
        () => load()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [supabase, me, load])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      await load()
    } catch {
      toast.error("처리에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    if (!me || submitting.current) return
    const t = title.trim()
    if (!t) return
    submitting.current = true
    run(async () => {
      try {
        await mustOk(supabase.from("personal_tasks").insert({ user_id: me, title: t, due_date: due || null }))
        setTitle("")
        setDue("")
      } finally {
        submitting.current = false
      }
    })
  }

  const toggle = (task: Task) =>
    run(async () => {
      await mustOk(
        supabase
          .from("personal_tasks")
          .update({ done: !task.done, updated_at: new Date().toISOString() })
          .eq("id", task.id)
      )
    })

  const remove = (id: string) =>
    run(async () => {
      await mustOk(supabase.from("personal_tasks").delete().eq("id", id))
    })

  if (loading) return null

  const remaining = tasks.filter((t) => !t.done).length

  return (
    <div className="shrink-0 rounded-xl border bg-card p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <ListTodo className="size-4 text-primary" /> 오늘 할 일
          {remaining > 0 && <span className="text-xs font-normal text-muted-foreground">· {remaining}개 남음</span>}
        </h2>
      </div>

      {/* 추가 입력 */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <input
          className={cn(fieldClass, "min-w-40 flex-1")}
          placeholder="할 일을 입력하고 Enter"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            // 한글 IME 조합 확정용 Enter는 무시(중복 추가 방지)
            if (e.key === "Enter" && !e.nativeEvent.isComposing) add()
          }}
        />
        <input
          type="date"
          className={cn(fieldClass, "w-36")}
          value={due}
          onChange={(e) => setDue(e.target.value)}
          title="기한(선택)"
        />
        <Button size="sm" onClick={add} disabled={busy || !title.trim()}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} 추가
        </Button>
      </div>

      {/* 목록 */}
      {tasks.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">할 일을 추가해 하루를 시작해보세요.</p>
      ) : (
        <div className="flex max-h-56 flex-col divide-y overflow-y-auto">
          {tasks.map((t) => {
            const d = t.due_date ? dueLabel(t.due_date) : null
            return (
              <div key={t.id} className="flex items-center gap-2 py-2 first:pt-0">
                <button
                  onClick={() => toggle(t)}
                  disabled={busy}
                  aria-label={t.done ? "완료 취소" : "완료"}
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
                    t.done ? "border-primary bg-primary text-primary-foreground" : "border-input hover:border-primary"
                  )}
                >
                  {t.done && <Check className="size-3.5" />}
                </button>
                <span className={cn("min-w-0 flex-1 truncate text-sm", t.done && "text-muted-foreground line-through")}>
                  {t.title}
                </span>
                {d && !t.done && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                      d.overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {d.text}
                  </span>
                )}
                <button
                  onClick={() => remove(t.id)}
                  disabled={busy}
                  aria-label="삭제"
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
