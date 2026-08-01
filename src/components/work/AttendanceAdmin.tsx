"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Users, ShieldCheck, Search, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { DateInput } from "@/components/shared/DateInput"
import { MonthStepper, currentYM, monthRange, type YM } from "@/components/shared/MonthStepper"
import { Loading } from "@/components/shared/States"
import { mustOk } from "@/lib/supabase/mustOk"
import { resolveLeavePolicy, computeBalance, type AttendanceBalanceRow, type LeaveBalance } from "@/lib/hr"
import { STATUS_BADGE, fmtTime, fmtDate, todayStr, workDuration } from "./AttendancePanel"

type Member = { id: string; name: string; department: string | null; position: string | null }
type Rec = {
  id: string
  user_id: string
  work_date: string
  check_in: string | null
  check_out: string | null
  status: string
  note: string | null
}

const UNDEPT = "부서 미지정"
const COLS = "id, user_id, work_date, check_in, check_out, status, note"

// ── 일별 그래프(flex식) — 시간축·상태별 파스텔 바 ──
const AXIS_START = 7 // 07:00
const AXIS_END = 22 // 22:00
const PPH = 52 // px per hour
/** 상태별 바 색 — 앱 의미색 관례(파스텔 배경 + 진한 전경) */
const BAR_STYLE: Record<string, string> = {
  정상: "border-emerald-300/60 bg-emerald-500/15 text-emerald-700",
  지각: "border-rose-300/60 bg-rose-500/15 text-rose-600",
  재택: "border-amber-300/60 bg-amber-500/20 text-amber-700",
  외근: "border-sky-300/60 bg-sky-500/15 text-sky-700",
  출장: "border-indigo-300/60 bg-indigo-500/15 text-indigo-700",
  반차: "border-violet-300/60 bg-violet-500/15 text-violet-700",
  연차: "border-purple-300/60 bg-purple-500/15 text-purple-700",
  월차: "border-teal-300/60 bg-teal-500/15 text-teal-700",
  결근: "border-border bg-muted text-muted-foreground",
}
/** 부재형(출퇴근 없이 사유만) 기본 표시 구간 — 연차·월차=종일, 반차=오전 반 */
const ABSENT_SPAN: Record<string, [number, number]> = { 연차: [9, 18], 월차: [9, 18], 결근: [9, 18], 반차: [9, 13.5] }
const REASON_STATUSES = ["재택", "외근", "출장", "반차", "연차", "월차", "결근"] as const

function hourOf(iso: string): number {
  const d = new Date(iso)
  return d.getHours() + d.getMinutes() / 60
}
function shiftDay(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function dayLabel(s: string): string {
  const d = new Date(`${s}T00:00:00`)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${"일월화수목금토"[d.getDay()]})`
}

/** 한 사람의 월 기록 요약 — 상태별 카운트 + 총 근무시간. */
function summarize(records: Rec[]) {
  const byStatus: Record<string, number> = {}
  let totalMs = 0
  for (const r of records) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
    if (r.check_in && r.check_out) totalMs += new Date(r.check_out).getTime() - new Date(r.check_in).getTime()
  }
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  return { byStatus, total: h > 0 ? `${h}시간 ${m}분` : `${m}분`, hasTotal: totalMs >= 60000 }
}

/**
 * 대표(owner) + 위임받은 사람만 보이는 팀 근태(세션41 개편 — flex식).
 * [일별 그래프] 날짜 선택 + 구성원×시간축 바(상태별 색·근무 중 표시) + 본인 사유 기입(휴가·반차 등).
 * [월별 상세] 기존 인원별 마스터/디테일. RLS(can_view_attendance)가 실제 게이트.
 */
export function AttendanceAdmin() {
  const supabase = createClient()
  const meId = useCurrentUserId()
  const wsId = useCurrentWorkspaceId()
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [recs, setRecs] = useState<Rec[]>([]) // 선택 월 전체 멤버 기록(월별 탭)
  const [dayRecs, setDayRecs] = useState<Rec[]>([]) // 선택 일 전체 멤버 기록(일별 그래프)
  const [viewers, setViewers] = useState<Set<string>>(new Set())
  const [balances, setBalances] = useState<Map<string, LeaveBalance>>(new Map()) // user_id → 연차 잔여(오너/위임자만 로드됨)
  const [todayRecs, setTodayRecs] = useState<Rec[]>([]) // 오늘 기록 — 월별 뷰 배지용(일별 그래프 날짜와 무관, 리뷰 A3)
  const [view, setView] = useState<"day" | "month">("day")
  const [day, setDay] = useState(todayStr())
  const [ym, setYm] = useState<YM>(currentYM)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [showPerms, setShowPerms] = useState(false)
  const [showReason, setShowReason] = useState(false)

  const load = useCallback(async () => {
    const { start, end } = monthRange(ym)
    const [{ data: ws }, { data: profs }, { data: monthRows }, { data: dRows }, { data: vw }, { data: tdRows }, { data: balRows }, { data: hrRow }] = await Promise.all([
      supabase.from("workspaces").select("owner_id").limit(1).maybeSingle(),
      supabase.from("profiles").select("id, name, department, position").order("name"),
      supabase.from("attendance_records").select(COLS).gte("work_date", start).lt("work_date", end).order("work_date", { ascending: false }),
      supabase.from("attendance_records").select(COLS).eq("work_date", day),
      supabase.from("attendance_viewers").select("viewer_user_id"),
      supabase.from("attendance_records").select(COLS).eq("work_date", todayStr()),
      // 연차 잔여 — RPC가 can_view_attendance로 게이팅(비권한자는 빈 결과)
      wsId ? supabase.rpc("attendance_balances", { p_workspace: wsId }) : Promise.resolve({ data: [] }),
      wsId ? supabase.from("hr_settings").select("leave_policy").eq("workspace_id", wsId).maybeSingle() : Promise.resolve({ data: null }),
    ])
    setOwnerId(ws?.owner_id ?? null)
    setMembers((profs as Member[]) ?? [])
    setRecs((monthRows as Rec[]) ?? [])
    setDayRecs((dRows as Rec[]) ?? [])
    setViewers(new Set((vw ?? []).map((v) => v.viewer_user_id)))
    setTodayRecs((tdRows as Rec[]) ?? [])
    // 정책(hr_settings) + RPC 집계 → 인원별 잔여(lib/hr 산식)
    const policy = resolveLeavePolicy((hrRow as { leave_policy: unknown } | null)?.leave_policy)
    const asOf = new Date()
    const bmap = new Map<string, LeaveBalance>()
    for (const row of ((balRows as unknown as AttendanceBalanceRow[] | null) ?? [])) {
      bmap.set(row.user_id, computeBalance(policy, row, asOf))
    }
    setBalances(bmap)
    setLoading(false)
  }, [supabase, ym, day, wsId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const isOwner = !!ownerId && ownerId === meId
  const isViewer = !!meId && viewers.has(meId)
  const canView = isOwner || isViewer

  const toggleViewer = async (m: Member) => {
    setBusyId(m.id)
    try {
      const granted = viewers.has(m.id)
      const { error } = await supabase.rpc(granted ? "revoke_attendance_viewer" : "grant_attendance_viewer", { target: m.id })
      if (error) throw new Error(error.message)
      toast.success(granted ? "근태 열람 권한을 회수했어요." : "근태 열람 권한을 부여했어요.")
      await load()
    } catch {
      toast.error("권한 변경에 실패했어요.")
    } finally {
      setBusyId(null)
    }
  }

  // 사유 기입(본인만 — RLS insert가 본인 한정) — 선택 날짜에 상태+메모 upsert
  const saveReason = async (date: string, status: string, note: string) => {
    if (!meId || !wsId) return
    try {
      // 리뷰 M4: 로드된 달 밖 날짜도 안전하게 — (본인, 날짜)로 직접 조회 후 분기(unique(user_id, work_date) 충돌 방지)
      const { data: existing } = await supabase
        .from("attendance_records")
        .select("id")
        .eq("user_id", meId)
        .eq("work_date", date)
        .maybeSingle()
      if (existing) {
        await mustOk(supabase.from("attendance_records").update({ status, note: note.trim() || null }).eq("id", existing.id))
      } else {
        await mustOk(
          supabase.from("attendance_records").insert({ workspace_id: wsId as string, user_id: meId, work_date: date, status, note: note.trim() || null })
        )
      }
      toast.success(`${dayLabel(date)} '${status}' 기록됨`)
      setShowReason(false)
      load()
    } catch {
      toast.error("기록에 실패했어요.")
    }
  }

  if (loading) return <Loading rows={3} />
  if (!canView) return null

  const q = query.trim().toLowerCase()
  const filtered = q ? members.filter((m) => m.name.toLowerCase().includes(q)) : members
  const dayByUser = new Map(dayRecs.map((r) => [r.user_id, r]))
  const todayByUser = new Map(todayRecs.map((r) => [r.user_id, r])) // 월별 뷰 배지 = 오늘 상태(리뷰 A3)
  const selected = selectedUser ?? filtered[0]?.id ?? null
  const selectedMember = members.find((m) => m.id === selected) ?? null
  const personRecs = selected ? recs.filter((r) => r.user_id === selected) : []
  const sum = summarize(personRecs)
  const selBal = selected ? balances.get(selected) : undefined
  const axisW = (AXIS_END - AXIS_START) * PPH
  const isToday = day === todayStr()

  return (
    <div className="flex flex-col gap-4 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Users className="size-4" /> 팀 근태
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* 일별 | 월별 전환 */}
          <div className="flex items-center rounded-lg border bg-card p-0.5 text-xs">
            {(["day", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn("rounded-md px-2.5 py-1 font-medium transition-colors", view === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {v === "day" ? "일별 그래프" : "월별 상세"}
              </button>
            ))}
          </div>
          {view === "day" ? (
            <div className="flex items-center gap-1">
              <button onClick={() => setDay(shiftDay(day, -1))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="전날">
                <ChevronLeft className="size-4" />
              </button>
              <DateInput className="w-36" value={day} onChange={(v) => v && setDay(v)} />
              <button onClick={() => setDay(shiftDay(day, 1))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="다음날">
                <ChevronRight className="size-4" />
              </button>
              {!isToday && (
                <button onClick={() => setDay(todayStr())} className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                  오늘
                </button>
              )}
            </div>
          ) : (
            <MonthStepper value={ym} onChange={setYm} max={currentYM()} />
          )}
          <Button size="sm" variant="outline" onClick={() => setShowReason(true)}>
            <Plus className="size-3.5" /> 사유 기입
          </Button>
          {isOwner && (
            <button
              onClick={() => setShowPerms((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors",
                showPerms ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <ShieldCheck className="size-3.5" /> 열람 권한
            </button>
          )}
        </div>
      </div>

      {/* 대표: 근태 열람 권한 위임 (접이식) */}
      {isOwner && showPerms && (
        <div className="rounded-xl border bg-muted/20 p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            지정한 직원은 전 직원 근태를 열람할 수 있어요(읽기 전용). 대표는 항상 열람 가능합니다.
          </p>
          <div className="flex flex-col divide-y rounded-lg border bg-background">
            {members
              .filter((m) => m.id !== ownerId)
              .map((m) => {
                const granted = viewers.has(m.id)
                return (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="font-medium">{m.name}</span>
                    {granted && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">열람 권한</span>}
                    <button
                      onClick={() => toggleViewer(m)}
                      disabled={busyId === m.id}
                      className="ml-auto inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      {granted ? "회수" : "권한 부여"}
                    </button>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {view === "day" ? (
        /* ── 일별 그래프 — 구성원 × 시간축(07~22시) 바 ── */
        <div className="overflow-x-auto rounded-xl border">
          <div className="min-w-fit">
            {/* 시간 눈금 헤더 */}
            <div className="flex border-b bg-muted/20">
              <div className="sticky left-0 z-20 w-44 shrink-0 border-r bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
                {dayLabel(day)}
              </div>
              <div className="relative h-8 shrink-0" style={{ width: axisW }}>
                {Array.from({ length: AXIS_END - AXIS_START + 1 }, (_, i) => AXIS_START + i).map((h) => (
                  <span key={h} className="absolute top-2 -translate-x-1/2 text-[10px] text-muted-foreground tabular-nums" style={{ left: (h - AXIS_START) * PPH }}>
                    {h}
                  </span>
                ))}
              </div>
            </div>
            {filtered.map((m) => {
              const r = dayByUser.get(m.id)
              const style = r ? (BAR_STYLE[r.status] ?? BAR_STYLE["정상"]) : null
              // 바 구간: 출근 기록이 있으면 출근~퇴근(퇴근 전+오늘이면 지금까지), 부재형이면 기본 구간
              let span: [number, number] | null = null
              let timeLabel = ""
              if (r?.check_in) {
                const s = hourOf(r.check_in)
                const e = r.check_out ? hourOf(r.check_out) : isToday ? hourOf(new Date().toISOString()) : s + 0.5
                // 축(07~22시) 밖 출퇴근도 항상 축 안에 그려지게 클램프(리뷰#6: 23시 출근이 오른쪽 밖으로 튀던 버그). 정확한 시각은 라벨에.
                const cs = Math.min(AXIS_END - 0.4, Math.max(AXIS_START, s))
                const ce = Math.max(cs + 0.4, Math.min(AXIS_END, e))
                span = [cs, ce]
                timeLabel = `${fmtTime(r.check_in)} ~ ${r.check_out ? fmtTime(r.check_out) : isToday ? "근무 중" : "—"}`
              } else if (r && ABSENT_SPAN[r.status]) {
                span = ABSENT_SPAN[r.status]
                timeLabel = r.note || ""
              } else if (r) {
                span = [9, 18]
                timeLabel = r.note || ""
              }
              const dur = r ? workDuration(r.check_in, r.check_out) : ""
              return (
                <div key={m.id} className="flex border-b last:border-b-0">
                  {/* 좌: 구성원 */}
                  <div className="sticky left-0 z-20 flex w-44 shrink-0 items-center gap-2 border-r bg-card px-3 py-2.5">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-[11px]">{m.name.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {m.name}
                        {m.id === meId && <span className="ml-1 rounded bg-muted px-1 text-[10px] font-normal text-muted-foreground">나</span>}
                      </span>
                      {dur ? (
                        <span className="text-[10px] text-muted-foreground tabular-nums">{dur}</span>
                      ) : (
                        m.position && <span className="truncate text-[10px] text-muted-foreground">{m.position}</span>
                      )}
                    </div>
                  </div>
                  {/* 우: 시간축 바 */}
                  <div className="relative h-14 shrink-0" style={{ width: axisW }}>
                    {Array.from({ length: AXIS_END - AXIS_START }, (_, i) => i + 1).map((i) => (
                      <div key={i} className="absolute inset-y-0 w-px bg-border/30" style={{ left: i * PPH }} />
                    ))}
                    {span && style ? (
                      <div
                        className={cn("absolute top-2 flex h-10 flex-col justify-center overflow-hidden rounded-lg border px-2.5", style)}
                        style={{ left: (span[0] - AXIS_START) * PPH, width: Math.max(28, (span[1] - span[0]) * PPH) }}
                        title={`${m.name} · ${r?.status}${timeLabel ? ` · ${timeLabel}` : ""}`}
                      >
                        <span className="truncate text-xs font-semibold leading-tight">{r?.status}</span>
                        {timeLabel && <span className="truncate text-[10px] leading-tight opacity-80 tabular-nums">{timeLabel}</span>}
                      </div>
                    ) : (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60">미기록</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* ── 월별 상세(기존 마스터/디테일) ── */
        <div className="grid gap-4 sm:grid-cols-[15rem_1fr]">
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름 검색"
                className="h-8 w-full rounded-lg border bg-background pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex max-h-80 flex-col overflow-y-auto rounded-xl border">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">직원이 없어요.</p>
              ) : (
                filtered.map((m) => {
                  const r = todayByUser.get(m.id) // 월별 뷰 배지 = 오늘 상태(리뷰 A3 — 일별 그래프 날짜와 무관)
                  const b = balances.get(m.id)
                  const active = m.id === selected
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedUser(m.id)}
                      className={cn(
                        "flex items-center gap-2.5 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0",
                        active ? "bg-primary/5" : "hover:bg-muted/40"
                      )}
                    >
                      <Avatar className="size-7">
                        <AvatarFallback className="text-[11px]">{m.name.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-1 truncate font-medium">
                          {m.name}
                          {m.id === meId && <span className="rounded bg-muted px-1 text-[10px] font-normal text-muted-foreground">나</span>}
                        </span>
                        {b ? (
                          <span className="truncate text-[11px] text-muted-foreground">연차 잔여 {b.remaining}일{m.position ? ` · ${m.position}` : ""}</span>
                        ) : (
                          m.position && <span className="truncate text-[11px] text-muted-foreground">{m.position}</span>
                        )}
                      </div>
                      <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium", STATUS_BADGE[r?.status ?? ""] ?? "bg-muted text-muted-foreground")}>
                        {r?.status ?? "미기록"}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            {selectedMember ? (
              <>
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-9">
                    <AvatarFallback className="text-xs">{selectedMember.name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-semibold">
                      {selectedMember.name}
                      {selectedMember.id === meId && <span className="ml-1 text-xs font-normal text-muted-foreground">(나)</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{selectedMember.department || UNDEPT}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {selBal && (
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                      잔여 연차 {selBal.remaining}일 <span className="font-normal opacity-70">/ 부여 {selBal.granted}일</span>
                    </span>
                  )}
                  {selBal && selBal.used_monthly > 0 && (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">월차 {selBal.used_monthly}회</span>
                  )}
                  {Object.entries(sum.byStatus).map(([s, n]) => (
                    <span key={s} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE[s] ?? "bg-muted text-muted-foreground")}>
                      {s} {n}
                    </span>
                  ))}
                  {sum.hasTotal && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">총 {sum.total}</span>}
                </div>

                {personRecs.length === 0 ? (
                  <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">이 달 근태 기록이 없어요.</p>
                ) : (
                  <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-sm)]">
                    {personRecs.map((r, i) => {
                      const dur = workDuration(r.check_in, r.check_out)
                      const isToday = r.work_date === todayStr()
                      // 시간 표시: 퇴근 있으면 범위 · 오늘 미퇴근이면 '근무 중' · 지난날 미퇴근이면 출근 시각만(부재형은 시각 없이 상태만)
                      const timeText = r.check_out
                        ? `${fmtTime(r.check_in)} – ${fmtTime(r.check_out)}`
                        : r.check_in
                          ? isToday
                            ? `${fmtTime(r.check_in)} · 근무 중`
                            : fmtTime(r.check_in)
                          : ""
                      return (
                        <div key={r.id} className={cn("flex items-center gap-3 px-4 py-3 text-sm", i > 0 && "border-t")}>
                          <span className="w-12 shrink-0 font-medium tabular-nums">{fmtDate(r.work_date)}</span>
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE[r.status] ?? "bg-muted text-muted-foreground")}>
                            {r.status}
                          </span>
                          {r.note && <span className="min-w-0 truncate text-xs text-muted-foreground">{r.note}</span>}
                          {timeText && <span className={cn("ml-auto shrink-0 tabular-nums", r.check_out ? "text-foreground" : "text-muted-foreground")}>{timeText}</span>}
                          {dur && <span className={cn("shrink-0 text-right text-xs text-muted-foreground tabular-nums", !timeText && "ml-auto")}>{dur}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">직원을 선택하면 개인별 근태를 볼 수 있어요.</p>
            )}
          </div>
        </div>
      )}

      {showReason && <ReasonDialog defaultDate={day} onSubmit={saveReason} onClose={() => setShowReason(false)} />}
    </div>
  )
}

/** 부재/근무형태 사유 기입 — 본인 기록만(RLS). 연차·반차·재택 등 + 메모 + 날짜 선택. */
function ReasonDialog({
  defaultDate,
  onSubmit,
  onClose,
}: {
  defaultDate: string
  onSubmit: (date: string, status: string, note: string) => Promise<void>
  onClose: () => void
}) {
  const [date, setDate] = useState(defaultDate)
  const [status, setStatus] = useState<string>("연차")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="사유 기입 (내 근태)" onClose={onClose} className="max-w-sm">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          날짜
          <DateInput className="w-full" value={date} onChange={(v) => v && setDate(v)} />
        </label>
        <div className="text-xs text-muted-foreground">
          사유
          <div className="mt-1 flex flex-wrap gap-1.5">
            {REASON_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  status === s ? "border-primary bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          메모 <span className="font-normal text-muted-foreground/60">(선택 — 예: 오후 반차, 병원)</span>
          <input className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 오후 반차" />
        </label>
        <p className="rounded-lg bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
          내 근태에만 기록돼요. 해당 날짜에 이미 기록이 있으면 사유가 갱신되고, 그래프에 색깔 바로 표시됩니다.
        </p>
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onSubmit(date, status, note)
              } finally {
                setBusy(false)
              }
            }}
          >
            기록
          </Button>
        </div>
      </div>
    </Modal>
  )
}
