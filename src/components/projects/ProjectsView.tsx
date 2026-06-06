"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Plus, FolderKanban, ChevronDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { Loading, EmptyState, ErrorState } from "@/components/shared/States"
import { useUndo } from "@/components/undo/UndoProvider"
import { PROJECT_STATUS, PROJECT_STATUS_ORDER } from "@/lib/projects"
import type { Project, ProjectStatus, Profile } from "@/types"

type ProjectRow = Project
type MemberLite = { id: string; name: string; avatar_url: string | null }

const PAGE_SIZE = 50

// 진행률(%) — 작업 단위 데이터가 없어 상태로 표현. 진행중/보류는 일정(시작~종료) 경과율, 완료=100, 예정/취소=0.
const STATUS_BASE_PROGRESS: Record<ProjectStatus, number> = {
  planned: 0,
  in_progress: 50,
  on_hold: 40,
  done: 100,
  canceled: 0,
}
function projectProgress(p: ProjectRow): number {
  if (p.status === "done") return 100
  if (p.status === "planned" || p.status === "canceled") return 0
  if (p.start_date && p.due_date) {
    const s = +new Date(p.start_date)
    const d = +new Date(p.due_date)
    const n = Date.now()
    if (d > s) return Math.min(100, Math.max(0, Math.round(((n - s) / (d - s)) * 100)))
  }
  return STATUS_BASE_PROGRESS[p.status as ProjectStatus]
}
function fmtDate(d: string): string {
  return d.length >= 10 ? d.slice(5).replace("-", ".") : d
}

export function ProjectsView() {
  const supabase = createClient()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [profiles, setProfiles] = useState<Pick<Profile, "id" | "name" | "avatar_url">[]>([])
  const [memberMap, setMemberMap] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [pageCount, setPageCount] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let q = supabase
        .from("projects")
        .select("*", { count: "exact" })
      if (statusFilter) q = q.eq("status", statusFilter)
      if (searchText.trim()) {
        const s = `%${searchText.trim()}%`
        q = q.or(`name.ilike.${s},description.ilike.${s}`)
      }
      const [projRes, profRes] = await Promise.all([
        q.order("created_at", { ascending: false }).range(0, pageCount * PAGE_SIZE - 1),
        supabase.from("profiles").select("id, name, avatar_url").order("name"),
      ])
      if (projRes.error) throw projRes.error
      if (profRes.error) throw profRes.error
      const projData = (projRes.data as ProjectRow[]) ?? []
      // 참여 인원(project_members) → 프로젝트별 user_id 목록
      const ids = projData.map((p) => p.id)
      if (ids.length) {
        const { data: pm } = await supabase
          .from("project_members")
          .select("project_id, user_id")
          .in("project_id", ids)
        const map: Record<string, string[]> = {}
        for (const row of pm ?? []) (map[row.project_id] ??= []).push(row.user_id)
        setMemberMap(map)
      } else {
        setMemberMap({})
      }
      setProjects(projData)
      setTotalCount(projRes.count ?? 0)
      setProfiles(profRes.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "프로젝트를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [supabase, searchText, statusFilter, pageCount])

  useEffect(() => {
    load()
  }, [load])

  // 되돌리기/다시실행 반영
  useEffect(() => {
    const h = () => load()
    window.addEventListener("equria:reload", h)
    return () => window.removeEventListener("equria:reload", h)
  }, [load])

  useEffect(() => {
    setPageCount(1)
  }, [searchText, statusFilter])

  const hasMore = projects.length < totalCount
  const profileById = new Map(profiles.map((pf) => [pf.id, pf] as const))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">프로젝트</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus /> 새 프로젝트
        </Button>
      </div>

      {/* 필터·검색 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="h-8 w-56 rounded-lg border border-border bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="프로젝트명·설명 검색…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <div className="relative">
          <select
            className="h-8 appearance-none rounded-lg border border-border bg-card pl-2.5 pr-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">상태: 전체</option>
            {PROJECT_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS[s].label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        {(searchText || statusFilter) && (
          <button
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => {
              setSearchText("")
              setStatusFilter("")
            }}
          >
            초기화
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">총 {totalCount.toLocaleString()}건</span>
      </div>

      {loading ? (
        <Loading rows={5} />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null)
            load()
          }}
        />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="아직 프로젝트가 없습니다. 첫 프로젝트를 만들어 보세요."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const ids = [p.owner_id, ...(memberMap[p.id] ?? [])].filter((v): v is string => !!v)
            const members = Array.from(new Set(ids))
              .map((uid) => profileById.get(uid))
              .filter((m): m is MemberLite => !!m)
            return <ProjectCard key={p.id} project={p} members={members} />
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setPageCount((p) => p + 1)}>
            더 보기 ({projects.length} / {totalCount})
          </Button>
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          profiles={profiles}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function ProjectCard({ project: p, members }: { project: ProjectRow; members: MemberLite[] }) {
  const st = PROJECT_STATUS[p.status as ProjectStatus]
  const pct = projectProgress(p)
  const canceled = p.status === "canceled"
  return (
    <Link
      href={`/projects/${p.id}`}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn("min-w-0 flex-1 truncate font-semibold", canceled && "text-muted-foreground line-through")}>
          {p.name}
        </h3>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs", st.badge)}>
          <span className="size-1.5 rounded-full" style={{ backgroundColor: st.dot }} />
          {st.label}
        </span>
      </div>
      {p.description && <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>진행률</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: canceled ? "var(--muted-foreground)" : st.dot }}
          />
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <AvatarStack members={members} />
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {p.start_date ? fmtDate(p.start_date) : "—"} ~ {p.due_date ? fmtDate(p.due_date) : "—"}
        </span>
      </div>
    </Link>
  )
}

function AvatarStack({ members }: { members: MemberLite[] }) {
  if (members.length === 0) {
    return <span className="text-[11px] text-muted-foreground">참여자 없음</span>
  }
  const shown = members.slice(0, 4)
  const extra = members.length - shown.length
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((m) => (
        <Avatar key={m.id} size="sm" className="ring-2 ring-card" title={m.name}>
          {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.name} />}
          <AvatarFallback className="text-[10px]">{m.name.slice(0, 2)}</AvatarFallback>
        </Avatar>
      ))}
      {extra > 0 && (
        <div className="grid size-6 place-items-center rounded-full border bg-muted text-[10px] text-muted-foreground ring-2 ring-card">
          +{extra}
        </div>
      )}
    </div>
  )
}

function CreateProjectModal({
  profiles,
  onClose,
  onCreated,
}: {
  profiles: Pick<Profile, "id" | "name">[]
  onClose: () => void
  onCreated: () => void
}) {
  const supabase = createClient()
  const { push } = useUndo()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<ProjectStatus>("planned")
  const [ownerId, setOwnerId] = useState("")
  const [startDate, setStartDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) {
      setError("프로젝트명을 입력해 주세요.")
      return
    }
    setSaving(true)
    setError(null)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      setError("로그인이 필요합니다.")
      setSaving(false)
      return
    }
    const { data: inserted, error: insErr } = await supabase
      .from("projects")
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        status,
        owner_id: ownerId || null,
        start_date: startDate || null,
        due_date: dueDate || null,
        created_by: auth.user.id,
      })
      .select()
      .single()
    setSaving(false)
    if (insErr) {
      setError(insErr.message)
      return
    }
    if (inserted) {
      push({
        label: "프로젝트 생성",
        undo: async () => {
          await supabase.from("projects").delete().eq("id", inserted.id)
        },
        redo: async () => {
          await supabase.from("projects").insert(inserted)
        },
      })
    }
    onCreated()
  }

  return (
    <Modal title="새 프로젝트" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input className={fieldClass} placeholder="프로젝트명" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <textarea
          className={cn(fieldClass, "h-16 resize-none py-2")}
          placeholder="설명 (선택)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            상태
            <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {PROJECT_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            담당자
            <select className={fieldClass} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">미지정</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            시작일
            <input type="date" className={fieldClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            종료예정
            <input type="date" className={fieldClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
