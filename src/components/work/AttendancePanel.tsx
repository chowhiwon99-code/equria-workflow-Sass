"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/shared/Select"
import { Loading } from "@/components/shared/States"

type Rec = {
  id: string
  work_date: string
  check_in: string | null
  check_out: string | null
  status: string
}

const STATUS = ["정상", "지각", "재택", "외근", "출장", "반차", "연차", "결근"] as const
export const STATUS_BADGE: Record<string, string> = {
  정상: "bg-emerald-100 text-emerald-700",
  지각: "bg-amber-100 text-amber-700",
  재택: "bg-blue-100 text-blue-700",
  외근: "bg-blue-100 text-blue-700",
  출장: "bg-violet-100 text-violet-700",
  반차: "bg-slate-100 text-slate-700",
  연차: "bg-slate-100 text-slate-700",
  결근: "bg-red-100 text-red-700",
}

export function todayStr(): string {
  return new Date().toLocaleDateString("en-CA") // YYYY-MM-DD (로컬 날짜)
}
export function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "—"
}
export function fmtDate(d: string): string {
  return d.slice(5).replace("-", ".") // MM.DD
}
/** 근무시간(출근~퇴근, 퇴근 전이면 현재까지) — "8시간 30분". */
function workDuration(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn) return ""
  const ms = (checkOut ? new Date(checkOut) : new Date()).getTime() - new Date(checkIn).getTime()
  if (ms <= 0) return ""
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`
}

export function AttendancePanel() {
  const supabase = createClient()
  const [me, setMe] = useState<string | null>(null)
  const [recs, setRecs] = useState<Rec[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return setLoading(false)
    setMe(auth.user.id)
    const { data } = await supabase
      .from("attendance_records")
      .select("id, work_date, check_in, check_out, status")
      .eq("user_id", auth.user.id)
      .order("work_date", { ascending: false })
      .limit(14)
    setRecs((data as Rec[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const today = recs.find((r) => r.work_date === todayStr()) ?? null

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

  const clockIn = () =>
    run(async () => {
      if (!me) return
      const now = new Date().toISOString()
      if (today) {
        await mustOk(supabase.from("attendance_records").update({ check_in: now }).eq("id", today.id))
      } else {
        await mustOk(
          supabase.from("attendance_records").insert({ user_id: me, work_date: todayStr(), check_in: now, status: "정상" })
        )
      }
      toast.success("출근 기록됐어요.")
    })

  const clockOut = () =>
    run(async () => {
      if (!today) return
      await mustOk(supabase.from("attendance_records").update({ check_out: new Date().toISOString() }).eq("id", today.id))
      toast.success("퇴근 기록됐어요.")
    })

  const setStatus = (s: string) =>
    run(async () => {
      if (!me) return
      if (today) {
        await mustOk(supabase.from("attendance_records").update({ status: s }).eq("id", today.id))
      } else {
        await mustOk(supabase.from("attendance_records").insert({ user_id: me, work_date: todayStr(), status: s }))
      }
    })

  if (loading) return <Loading rows={4} />

  return (
    <div className="flex flex-col gap-5">
      {/* 오늘 카드 */}
      <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-sm)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">오늘 ({fmtDate(todayStr())})</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                STATUS_BADGE[today?.status ?? "정상"] ?? "bg-muted text-muted-foreground"
              )}
            >
              {today?.status ?? "미기록"}
            </span>
          </div>
          <Select
            value={today?.status ?? "정상"}
            onChange={setStatus}
            options={STATUS.map((s) => ({ value: s, label: s }))}
            align="end"
            className="h-8"
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">출근</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmtTime(today?.check_in ?? null)}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">퇴근</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmtTime(today?.check_out ?? null)}</p>
          </div>
        </div>
        {today?.check_in && (
          <p className="mt-2.5 text-xs text-muted-foreground">
            근무시간 <span className="font-semibold text-foreground">{workDuration(today.check_in, today.check_out)}</span>
            {!today.check_out && <span className="ml-1 text-primary">· 근무 중</span>}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={clockIn} disabled={busy || !!today?.check_in} className="flex-1">
            출근
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={clockOut}
            disabled={busy || !today?.check_in || !!today?.check_out}
            className="flex-1"
          >
            퇴근
          </Button>
        </div>
      </div>

      {/* 최근 내역 */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">최근 근태</h2>
        {recs.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 근태 기록이 없어요.</p>
        ) : (
          <div className="flex flex-col divide-y rounded-xl border">
            {recs.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{fmtDate(r.work_date)}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    STATUS_BADGE[r.status] ?? "bg-muted text-muted-foreground"
                  )}
                >
                  {r.status}
                </span>
                <span className="ml-auto text-muted-foreground tabular-nums">
                  {fmtTime(r.check_in)} ~ {fmtTime(r.check_out)}
                </span>
                {r.check_in && r.check_out && (
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground/80 tabular-nums">
                    {workDuration(r.check_in, r.check_out)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
