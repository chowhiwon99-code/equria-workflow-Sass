"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Users, ShieldCheck, Search } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MonthStepper, currentYM, monthRange, type YM } from "@/components/shared/MonthStepper"
import { Loading } from "@/components/shared/States"
import { STATUS_BADGE, fmtTime, fmtDate, todayStr, workDuration } from "./AttendancePanel"

type Member = { id: string; name: string; department: string | null; position: string | null }
type Rec = {
  id: string
  user_id: string
  work_date: string
  check_in: string | null
  check_out: string | null
  status: string
}

const UNDEPT = "부서 미지정"

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
 * 대표(owner) + 위임받은 사람만 보이는 팀 근태 — 월별 · 인원별 마스터/디테일.
 * 좌: 직원 목록(검색 + 오늘 상태) · 우: 선택한 직원의 선택 월 요약·기록.
 * RLS(can_view_attendance)가 실제 게이트 — 비위임 직원에겐 본인 것만 보여 canView=false로 숨긴다.
 */
export function AttendanceAdmin() {
  const supabase = createClient()
  const meId = useCurrentUserId()
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [recs, setRecs] = useState<Rec[]>([]) // 선택 월 전체 멤버 기록
  const [todayRecs, setTodayRecs] = useState<Rec[]>([]) // 오늘 기록(목록 배지용 — 월과 무관)
  const [viewers, setViewers] = useState<Set<string>>(new Set())
  const [ym, setYm] = useState<YM>(currentYM)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [showPerms, setShowPerms] = useState(false)

  const load = useCallback(async () => {
    const { start, end } = monthRange(ym)
    const cols = "id, user_id, work_date, check_in, check_out, status"
    const [{ data: ws }, { data: profs }, { data: monthRows }, { data: tdRows }, { data: vw }] = await Promise.all([
      supabase.from("workspaces").select("owner_id").limit(1).maybeSingle(),
      supabase.from("profiles").select("id, name, department, position").order("name"),
      supabase.from("attendance_records").select(cols).gte("work_date", start).lt("work_date", end).order("work_date", { ascending: false }),
      supabase.from("attendance_records").select(cols).eq("work_date", todayStr()),
      supabase.from("attendance_viewers").select("viewer_user_id"),
    ])
    setOwnerId(ws?.owner_id ?? null)
    setMembers((profs as Member[]) ?? [])
    setRecs((monthRows as Rec[]) ?? [])
    setTodayRecs((tdRows as Rec[]) ?? [])
    setViewers(new Set((vw ?? []).map((v) => v.viewer_user_id)))
    setLoading(false)
  }, [supabase, ym])

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

  if (loading) return <Loading rows={3} />
  if (!canView) return null

  const todayByUser = new Map(todayRecs.map((r) => [r.user_id, r]))
  const q = query.trim().toLowerCase()
  const filtered = q ? members.filter((m) => m.name.toLowerCase().includes(q)) : members
  const selected = selectedUser ?? filtered[0]?.id ?? null
  const selectedMember = members.find((m) => m.id === selected) ?? null
  const personRecs = selected ? recs.filter((r) => r.user_id === selected) : []
  const sum = summarize(personRecs)

  return (
    <div className="flex flex-col gap-4 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Users className="size-4" /> 팀 근태
        </h2>
        <div className="flex items-center gap-2">
          <MonthStepper value={ym} onChange={setYm} max={currentYM()} />
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
                    {granted && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">열람 권한</span>
                    )}
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

      <div className="grid gap-4 sm:grid-cols-[15rem_1fr]">
        {/* 좌: 직원 목록(검색 + 오늘 상태) */}
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
                const r = todayByUser.get(m.id)
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
                      {m.position && <span className="truncate text-[11px] text-muted-foreground">{m.position}</span>}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        STATUS_BADGE[r?.status ?? ""] ?? "bg-muted text-muted-foreground"
                      )}
                    >
                      {r?.status ?? "미기록"}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* 우: 선택한 직원의 선택 월 상세 */}
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

              {/* 월 요약 */}
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(sum.byStatus).map(([s, n]) => (
                  <span key={s} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE[s] ?? "bg-muted text-muted-foreground")}>
                    {s} {n}
                  </span>
                ))}
                {sum.hasTotal && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">총 {sum.total}</span>
                )}
              </div>

              {/* 월 기록 */}
              {personRecs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">이 달 근태 기록이 없어요.</p>
              ) : (
                <div className="flex flex-col divide-y rounded-xl border">
                  {personRecs.map((r) => {
                    const dur = workDuration(r.check_in, r.check_out)
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{fmtDate(r.work_date)}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE[r.status] ?? "bg-muted text-muted-foreground")}>
                          {r.status}
                        </span>
                        <span className="ml-auto text-muted-foreground tabular-nums">
                          {fmtTime(r.check_in)} ~ {fmtTime(r.check_out)}
                        </span>
                        {dur && <span className="w-20 shrink-0 text-right text-xs text-muted-foreground/80 tabular-nums">{dur}</span>}
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
    </div>
  )
}
