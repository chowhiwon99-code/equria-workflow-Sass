"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CircleDot, CircleDashed } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Surface } from "@/components/shared/Surface"
import { EmptyState } from "@/components/shared/States"
import type { Project } from "@/types"

/**
 * 진행 중/예정 작업(세션41 대표 요청) — 프로젝트 + 열린 할 일 수를 대시보드에서 한눈에.
 * 클릭=프로젝트 상세(타임라인·체크리스트에서 조정). 데이터는 RLS 스코프 그대로.
 */

function dday(due: string | null): string | null {
  if (!due) return null
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  const n = Math.round((new Date(`${due}T00:00:00`).getTime() - t.getTime()) / 86400000)
  return n > 0 ? `D-${n}` : n === 0 ? "D-DAY" : `${-n}일 지남`
}

export function WorkOverview() {
  const supabase = createClient()
  const [projects, setProjects] = useState<Project[]>([])
  const [openTasks, setOpenTasks] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    const { data: proj } = await supabase
      .from("projects")
      .select("*")
      .is("deleted_at", null)
      .in("status", ["in_progress", "planned"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(20)
    const list = (proj as Project[]) ?? []
    setProjects(list)
    if (list.length) {
      const { data: pt } = await supabase.from("project_tasks").select("project_id, done").in("project_id", list.map((p) => p.id))
      const m: Record<string, number> = {}
      for (const r of pt ?? []) if (!r.done) m[r.project_id] = (m[r.project_id] ?? 0) + 1
      setOpenTasks(m)
    } else {
      setOpenTasks({})
    }
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 로드(공통 패턴)
    load()
  }, [load])

  useEffect(() => {
    const h = () => load()
    window.addEventListener("equria:reload", h)
    return () => window.removeEventListener("equria:reload", h)
  }, [load])

  const inProgress = projects.filter((p) => p.status === "in_progress")
  const planned = projects.filter((p) => p.status === "planned")

  const row = (p: Project) => {
    const d = dday(p.due_date)
    const open = openTasks[p.id] ?? 0
    return (
      <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/50">
        <span className="min-w-0 truncate font-medium">{p.name}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {open > 0 && <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">{open} 남음</span>}
          {d && <span className={cn("rounded px-1.5 py-0.5 font-semibold tabular-nums", d.includes("지남") ? "bg-rose-500/10 text-rose-500" : "bg-muted")}>{d}</span>}
        </span>
      </Link>
    )
  }

  return (
    // @2xl: 대시보드 좌측 컨테이너 폭 기준 자동 반응(좁으면 세로 스택)
    <div className="grid shrink-0 gap-3 @2xl:grid-cols-2">
      <Surface padding="none" className="rounded-xl p-3">
        <h2 className="mb-1.5 inline-flex items-center gap-2 text-sm font-semibold">
          <CircleDot className="size-4 text-info" /> 진행 중인 작업
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{inProgress.length}</span>
        </h2>
        {inProgress.length === 0 ? (
          // 아이콘 제거 — 카드가 좁아질 때 필요 높이가 줄어 겹침 재발 가능성도 함께 낮춘다(대표 지적 2026-08-27).
          <EmptyState
            className="border-0 py-4"
            title="진행 중인 작업이 없어요."
            action={
              <Link href="/projects" className="text-xs text-primary underline underline-offset-2">
                프로젝트 만들기
              </Link>
            }
          />
        ) : (
          <div className="flex max-h-48 flex-col overflow-y-auto">{inProgress.map(row)}</div>
        )}
      </Surface>
      <Surface padding="none" className="rounded-xl p-3">
        <h2 className="mb-1.5 inline-flex items-center gap-2 text-sm font-semibold">
          <CircleDashed className="size-4 text-muted-foreground" /> 예정된 작업
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{planned.length}</span>
        </h2>
        {planned.length === 0 ? (
          <EmptyState className="border-0 py-4" title="예정된 작업이 없어요." />
        ) : (
          <div className="flex max-h-48 flex-col overflow-y-auto">{planned.map(row)}</div>
        )}
      </Surface>
    </div>
  )
}
