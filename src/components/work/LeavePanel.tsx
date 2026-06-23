"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/shared/Select"
import { Loading } from "@/components/shared/States"
import { fieldClass } from "@/components/shared/Modal"
import { STATUS_BADGE } from "./status"

type Row = {
  id: string
  leave_type: string
  start_date: string
  end_date: string
  reason: string | null
  status: string
  user_id: string
  created_at: string
}

const TYPES = ["연차", "반차", "병가", "경조사", "공가", "기타"] as const

export function LeavePanel() {
  const supabase = createClient()
  const [me, setMe] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const [positions, setPositions] = useState<Record<string, string | null>>({})
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const todayIso = new Date().toLocaleDateString("en-CA")
  const [type, setType] = useState<string>("연차")
  const [start, setStart] = useState(todayIso)
  const [end, setEnd] = useState(todayIso)
  const [reason, setReason] = useState("")

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return setLoading(false)
    setMe(auth.user.id)
    const [{ data: prof }, { data: list }, { data: ppl }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", auth.user.id).single(),
      supabase
        .from("leave_requests")
        .select("id, leave_type, start_date, end_date, reason, status, user_id, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name, position"),
    ])
    setIsAdmin(prof?.role === "admin")
    setRows((list as Row[]) ?? [])
    setNames(Object.fromEntries((ppl ?? []).map((p) => [p.id, p.name])))
    setPositions(Object.fromEntries((ppl ?? []).map((p) => [p.id, p.position])))
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

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

  const submit = () => {
    if (!me) return
    if (end < start) {
      toast.error("종료일이 시작일보다 빠를 수 없어요.")
      return
    }
    run(async () => {
      await mustOk(
        supabase.from("leave_requests").insert({
          user_id: me,
          leave_type: type,
          start_date: start,
          end_date: end,
          reason: reason.trim() || null,
        })
      )
      setReason("")
      toast.success("휴가를 신청했어요.")
    })
  }

  const review = (id: string, status: "승인" | "반려") =>
    run(async () => {
      await mustOk(
        supabase
          .from("leave_requests")
          .update({ status, reviewed_by: me, reviewed_at: new Date().toISOString() })
          .eq("id", id)
      )
    })

  const cancel = (id: string) =>
    run(async () => {
      await mustOk(supabase.from("leave_requests").delete().eq("id", id))
    })

  if (loading) return <Loading rows={4} />

  return (
    <div className="flex flex-col gap-5">
      {/* 신청 폼 */}
      <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 text-sm font-semibold">휴가 신청</h2>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={type} onChange={setType} options={TYPES.map((t) => ({ value: t, label: t }))} className="h-9" />
            <input type="date" className={cn(fieldClass, "w-auto")} value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="text-sm text-muted-foreground">~</span>
            <input type="date" className={cn(fieldClass, "w-auto")} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <textarea
            className={cn(fieldClass, "h-16 resize-none py-2")}
            placeholder="사유 (선택)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={busy}>
              신청
            </Button>
          </div>
        </div>
      </div>

      {/* 목록 */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">{isAdmin ? "전체 휴가 신청" : "내 휴가 신청"}</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 신청한 휴가가 없어요.</p>
        ) : (
          <div className="flex flex-col divide-y rounded-xl border">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{r.leave_type}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium tabular-nums">
                    {r.start_date.slice(5).replace("-", ".")} ~ {r.end_date.slice(5).replace("-", ".")}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {r.reason || "사유 없음"}
                    {isAdmin && r.user_id !== me && ` · ${[names[r.user_id] ?? "직원", positions[r.user_id]].filter(Boolean).join(" · ")}`}
                  </span>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_BADGE[r.status])}>
                  {r.status}
                </span>
                {isAdmin && r.status === "대기" && (
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => review(r.id, "승인")} className="text-xs text-emerald-600 hover:underline" disabled={busy}>
                      승인
                    </button>
                    <button onClick={() => review(r.id, "반려")} className="text-xs text-destructive hover:underline" disabled={busy}>
                      반려
                    </button>
                  </div>
                )}
                {!isAdmin && r.user_id === me && r.status === "대기" && (
                  <button onClick={() => cancel(r.id)} className="shrink-0 text-xs text-muted-foreground hover:text-destructive" disabled={busy}>
                    취소
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
