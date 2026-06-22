"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Users, ShieldCheck } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Loading } from "@/components/shared/States"
import { STATUS_BADGE, fmtTime, fmtDate, todayStr } from "./AttendancePanel"

type Member = { id: string; name: string; department: string | null }
type Rec = {
  id: string
  user_id: string
  work_date: string
  check_in: string | null
  check_out: string | null
  status: string
}

const UNDEPT = "부서 미지정"

/**
 * 대표(owner) + 위임받은 사람만 보이는 팀 근태 현황판 + (대표 전용) 열람 권한 위임.
 * RLS(can_view_attendance)가 실제 게이트 — 비위임 직원에겐 recs가 본인 것뿐이라 canView=false로 숨긴다.
 */
export function AttendanceAdmin() {
  const supabase = createClient()
  const [meId, setMeId] = useState<string | null>(null)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [recs, setRecs] = useState<Rec[]>([])
  const [viewers, setViewers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    setMeId(auth.user?.id ?? null)
    const since = new Date(Date.now() - 13 * 86400000).toLocaleDateString("en-CA")
    const [{ data: ws }, { data: profs }, { data: recRows }, { data: vw }] = await Promise.all([
      supabase.from("workspaces").select("owner_id").limit(1).maybeSingle(),
      supabase.from("profiles").select("id, name, department").order("name"),
      supabase
        .from("attendance_records")
        .select("id, user_id, work_date, check_in, check_out, status")
        .gte("work_date", since)
        .order("work_date", { ascending: false }),
      supabase.from("attendance_viewers").select("viewer_user_id"),
    ])
    setOwnerId(ws?.owner_id ?? null)
    setMembers((profs as Member[]) ?? [])
    setRecs((recRows as Rec[]) ?? [])
    setViewers(new Set((vw ?? []).map((v) => v.viewer_user_id)))
    setLoading(false)
  }, [supabase])

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
      const { error } = await supabase.rpc(
        granted ? "revoke_attendance_viewer" : "grant_attendance_viewer",
        { target: m.id }
      )
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

  const today = todayStr()
  const todayByUser = new Map(recs.filter((r) => r.work_date === today).map((r) => [r.user_id, r]))

  return (
    <div className="flex flex-col gap-5 border-t pt-5">
      {/* 오늘 팀 근태 현황 */}
      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Users className="size-4" /> 오늘 팀 근태
          <span className="text-xs font-normal text-muted-foreground">({fmtDate(today)})</span>
        </h2>
        <div className="flex flex-col divide-y rounded-xl border">
          {members.map((m) => {
            const r = todayByUser.get(m.id)
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">{m.name.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">{m.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{m.department || UNDEPT}</span>
                </div>
                <span
                  className={cn(
                    "ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium",
                    STATUS_BADGE[r?.status ?? ""] ?? "bg-muted text-muted-foreground"
                  )}
                >
                  {r?.status ?? "미기록"}
                </span>
                <span className="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {r ? `${fmtTime(r.check_in)} ~ ${fmtTime(r.check_out)}` : "—"}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 최근 14일 기록 */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">최근 기록 (14일)</h2>
        {recs.length === 0 ? (
          <p className="text-sm text-muted-foreground">최근 근태 기록이 없어요.</p>
        ) : (
          <div className="flex flex-col divide-y rounded-xl border">
            {recs.map((r) => {
              const m = members.find((x) => x.id === r.user_id)
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{fmtDate(r.work_date)}</span>
                  <span className="w-24 shrink-0 truncate font-medium">{m?.name ?? "—"}</span>
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
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 대표: 근태 열람 권한 위임 */}
      {isOwner && (
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <ShieldCheck className="size-4" /> 근태 열람 권한
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            지정한 직원은 전 직원 근태를 열람할 수 있어요(읽기 전용). 대표는 항상 열람 가능합니다.
          </p>
          <div className="flex flex-col divide-y rounded-xl border">
            {members
              .filter((m) => m.id !== ownerId)
              .map((m) => {
                const granted = viewers.has(m.id)
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="font-medium">{m.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.department || UNDEPT}</span>
                    {granted && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        열람 권한
                      </span>
                    )}
                    <button
                      onClick={() => toggleViewer(m)}
                      disabled={busyId === m.id}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      {granted ? "권한 회수" : "열람 권한 부여"}
                    </button>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
