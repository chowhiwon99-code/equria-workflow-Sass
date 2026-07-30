"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { PROJECT_STATUS, PROJECT_STATUS_ORDER } from "@/lib/projects"
import type { Project, ProjectStatus } from "@/types"

/**
 * 노션식 프로젝트 타임라인(세션41 대표 요청) — 상태 그룹 × 기간 바(시작~종료) 시각화.
 * 바 = D-day·이름·할 일 배지(남음/오늘/지남/완료)·진행률. 드래그=기간 이동, 양끝 드래그=시작/종료 조절, 클릭=상세.
 * 데이터 모델 무변경 — projects.start_date/due_date + project_tasks(done·due_date)만 사용.
 */

export type TaskLite = { done: boolean; due_date: string | null }

const PPD = 4 // px per day
const ROW_H = 44
const DAY = 86400000

function d0(s: string): number {
  return new Date(`${s}T00:00:00`).getTime()
}
function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

type DragState = { id: string; mode: "move" | "start" | "due"; startX: number; dDays: number; moved: boolean }

export function ProjectTimeline({
  projects,
  tasksByProject,
  onMove,
}: {
  projects: Project[]
  tasksByProject: Record<string, TaskLite[]>
  onMove: (p: Project, newStart: string, newDue: string) => void
}) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<DragState | null>(null)

  const today = todayStr()
  const todayT = d0(today)

  const dated = useMemo(() => projects.filter((p) => p.start_date && p.due_date), [projects])
  const undated = useMemo(() => projects.filter((p) => !p.start_date || !p.due_date), [projects])

  // 축 범위 — 프로젝트 기간 전체 + 오늘, 앞뒤 여백(계산이 가벼워 매 렌더 재계산 — React Compiler 친화)
  const starts = dated.map((p) => d0(p.start_date as string))
  const dues = dated.map((p) => d0(p.due_date as string))
  const minT = Math.min(...(starts.length ? starts : [todayT]), todayT) - 14 * DAY
  const maxT = Math.max(...(dues.length ? dues : [todayT]), todayT) + 45 * DAY
  const width = Math.ceil((maxT - minT) / DAY) * PPD
  // 월 눈금 — 범위 안의 매월 1일
  const months: { x: number; label: string }[] = []
  {
    const c = new Date(minT)
    c.setDate(1)
    c.setHours(0, 0, 0, 0)
    while (c.getTime() <= maxT) {
      if (c.getTime() >= minT) {
        months.push({
          x: ((c.getTime() - minT) / DAY) * PPD,
          label: c.getMonth() === 0 ? `${c.getFullYear()}년 1월` : `${c.getMonth() + 1}월`,
        })
      }
      c.setMonth(c.getMonth() + 1)
    }
  }

  const x = (t: number) => ((t - minT) / DAY) * PPD

  const groups = useMemo(
    () =>
      PROJECT_STATUS_ORDER.map((s) => ({ status: s, items: dated.filter((p) => p.status === s) })).filter(
        (g) => g.items.length > 0
      ),
    [dated]
  )

  const toggle = (s: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })

  const startDrag = (e: React.PointerEvent, p: Project, mode: DragState["mode"]) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const onMoveEv = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      setDrag({ id: p.id, mode, startX, dDays: Math.round(dx / PPD), moved: Math.abs(dx) > 4 })
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMoveEv)
      window.removeEventListener("pointerup", onUp)
      const dDays = Math.round((ev.clientX - startX) / PPD)
      const moved = Math.abs(ev.clientX - startX) > 4
      setDrag(null)
      if (!moved) {
        if (mode === "move") router.push(`/projects/${p.id}`)
        return
      }
      const s = p.start_date as string
      const d = p.due_date as string
      if (mode === "move") onMove(p, addDays(s, dDays), addDays(d, dDays))
      else if (mode === "start") {
        const ns = addDays(s, dDays)
        onMove(p, d0(ns) > d0(d) ? d : ns, d)
      } else {
        const nd = addDays(d, dDays)
        onMove(p, s, d0(nd) < d0(s) ? s : nd)
      }
    }
    window.addEventListener("pointermove", onMoveEv)
    window.addEventListener("pointerup", onUp)
    setDrag({ id: p.id, mode, startX, dDays: 0, moved: false })
  }

  if (dated.length === 0 && undated.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {dated.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-[var(--shadow-sm)]">
          <div className="relative" style={{ width, minWidth: "100%" }}>
            {/* 월 경계선(전체 높이) */}
            {months.map((m) => (
              <div key={m.x} className="absolute inset-y-0 w-px bg-border/60" style={{ left: m.x }} />
            ))}
            {/* 오늘 세로선 */}
            <div className="absolute inset-y-0 z-10 w-px bg-rose-400" style={{ left: x(todayT) }} />

            {/* 월 라벨 헤더 */}
            <div className="relative h-9 border-b">
              {months.map((m) => (
                <span key={m.x} className="absolute top-2 text-[11px] font-medium text-muted-foreground" style={{ left: m.x + 6 }}>
                  {m.label}
                </span>
              ))}
              <span
                className="absolute top-1.5 z-10 -translate-x-1/2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums"
                style={{ left: x(todayT) }}
                title="오늘"
              >
                {Number(today.slice(8, 10))}
              </span>
            </div>

            {/* 상태 그룹 */}
            {groups.map((g) => {
              const st = PROJECT_STATUS[g.status as ProjectStatus]
              const isCollapsed = collapsed.has(g.status)
              return (
                <div key={g.status}>
                  <button
                    onClick={() => toggle(g.status)}
                    className="sticky left-0 z-20 flex h-9 items-center gap-1.5 px-3 text-xs font-semibold hover:text-foreground"
                    title={isCollapsed ? "펼치기" : "접기"}
                  >
                    {isCollapsed ? <ChevronRight className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", st.badge)}>
                      <st.icon className="size-3" />
                      {st.label}
                    </span>
                    <span className="font-normal text-muted-foreground tabular-nums">{g.items.length}</span>
                  </button>
                  {!isCollapsed &&
                    g.items.map((p) => (
                      <TimelineRow
                        key={p.id}
                        project={p}
                        tasks={tasksByProject[p.id] ?? []}
                        today={today}
                        x={x}
                        drag={drag?.id === p.id ? drag : null}
                        onStartDrag={startDrag}
                      />
                    ))}
                </div>
              )
            })}
            <div className="h-3" />
          </div>
        </div>
      ) : (
        <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground shadow-[var(--shadow-sm)]">
          시작일·종료 예정일이 있는 프로젝트가 타임라인에 표시돼요.
        </p>
      )}

      {/* 기간 미설정 — 날짜를 정하면 타임라인에 올라온다 */}
      {undated.length > 0 && (
        <div className="rounded-xl border bg-card p-3 shadow-[var(--shadow-sm)]">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">기간 미설정 — 상세에서 시작일·종료 예정일을 정하면 타임라인에 표시돼요.</p>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((p) => {
              const st = PROJECT_STATUS[p.status as ProjectStatus]
              return (
                <Link key={p.id} href={`/projects/${p.id}`} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted">
                  <span className="size-2 rounded-full" style={{ backgroundColor: st.dot }} />
                  {p.name}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** 타임라인 한 행 — 기간 바 + D-day + 할 일 배지 + 진행률. 바 드래그=이동, 양끝=시작/종료 조절. */
function TimelineRow({
  project: p,
  tasks,
  today,
  x,
  drag,
  onStartDrag,
}: {
  project: Project
  tasks: TaskLite[]
  today: string
  x: (t: number) => number
  drag: DragState | null
  onStartDrag: (e: React.PointerEvent, p: Project, mode: DragState["mode"]) => void
}) {
  const st = PROJECT_STATUS[p.status as ProjectStatus]
  const s = p.start_date as string
  const d = p.due_date as string
  const shift = drag ? drag.dDays * PPD : 0
  const left = x(d0(s)) + (drag && drag.mode !== "due" ? shift : 0)
  const right = x(d0(d)) + PPD + (drag && drag.mode !== "start" ? shift : 0)
  const w = Math.max(PPD * 2, right - left)

  // 할 일 통계 — 남음/오늘/지남/완료(노션식 배지)
  const doneN = tasks.filter((t) => t.done).length
  const open = tasks.filter((t) => !t.done)
  const todayN = open.filter((t) => t.due_date === today).length
  const overdue = open.filter((t) => t.due_date && (t.due_date as string) < today).length
  const leftN = open.length - todayN - overdue
  const pct = tasks.length > 0 ? Math.round((doneN / tasks.length) * 100) : null

  // D-day — 완료 프로젝트는 생략
  const dday = Math.round((d0(d) - d0(today)) / DAY)
  const ddayLabel = p.status === "done" ? null : dday > 0 ? `D-${dday}` : dday === 0 ? "D-DAY" : `${-dday}일 지남`

  return (
    <div className="relative" style={{ height: ROW_H }}>
      <div className="absolute top-1.5 flex items-center" style={{ left }}>
        <div
          onPointerDown={(e) => onStartDrag(e, p, "move")}
          className={cn("group relative h-8 rounded-lg border shadow-sm", drag ? "cursor-grabbing" : "cursor-grab")}
          style={{ width: w, backgroundColor: `${st.dot}1f`, borderColor: `${st.dot}66` }}
          title={`${p.name} · ${s} ~ ${d} — 드래그로 이동, 양끝으로 기간 조절, 클릭=상세`}
        >
          {/* 진행률 채움(할 일 완료율 없으면 기간 경과율) */}
          <div
            className="absolute inset-y-0 left-0 rounded-lg opacity-40"
            style={{
              width: `${pct ?? Math.min(100, Math.max(0, ((d0(today) - d0(s)) / Math.max(1, d0(d) - d0(s))) * 100))}%`,
              backgroundColor: st.dot,
            }}
          />
          {/* 양끝 리사이즈 핸들 */}
          <div onPointerDown={(e) => onStartDrag(e, p, "start")} className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l-lg" title="시작일 조절" />
          <div onPointerDown={(e) => onStartDrag(e, p, "due")} className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r-lg" title="종료일 조절" />
          {/* 라벨 — 바가 좁으면 오른쪽으로 흘러넘침(노션식) */}
          <div className="absolute inset-y-0 left-2 z-[5] flex items-center gap-1.5 whitespace-nowrap text-xs">
            {ddayLabel && (
              <span className={cn("rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums", dday < 0 ? "bg-rose-500/15 text-rose-600" : "bg-background/80 text-foreground")}>
                {ddayLabel}
              </span>
            )}
            <span className="font-semibold">{p.name}</span>
            {leftN > 0 && <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground tabular-nums">{leftN} 남음</span>}
            {todayN > 0 && <span className="rounded bg-info-bg px-1 py-0.5 text-[10px] text-info tabular-nums">{todayN} 오늘</span>}
            {overdue > 0 && <span className="rounded bg-warning-bg px-1 py-0.5 text-[10px] text-warning-foreground tabular-nums">{overdue} 지남</span>}
            {doneN > 0 && <span className="rounded bg-success-bg px-1 py-0.5 text-[10px] text-success tabular-nums">{doneN} 완료</span>}
            {pct != null && <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
