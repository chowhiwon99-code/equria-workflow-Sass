"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Plus, FolderKanban, Check, Trash2 } from "lucide-react"
import { Select } from "@/components/shared/Select"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { Loading, EmptyState, ErrorState } from "@/components/shared/States"
import { useUndo } from "@/components/undo/UndoProvider"
import { PROJECT_STATUS, PROJECT_STATUS_ORDER } from "@/lib/projects"
import { IMPORTANCE, importanceLabel, importanceColor, tagBg } from "@/lib/meetingMeta"
import type { Project, ProjectStatus, Profile } from "@/types"

type ProjectRow = Project
type MemberLite = { id: string; name: string; avatar_url: string | null; position: string | null }

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

// 중요도 배지(없음=0이면 숨김) — 회의노트 meetingMeta 패턴 재사용.
function ImportanceBadge({ value }: { value: number }) {
  if (!value) return null
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: tagBg(importanceColor(value)) }}
    >
      {importanceLabel(value)}
    </span>
  )
}

export function ProjectsView() {
  const supabase = createClient()
  const me = useCurrentUserId()
  const { push } = useUndo()

  // 프로젝트 삭제 = 하드삭제(기존 DELETE RLS=created_by, 마이그 불필요·즉시 동작).
  // FK: members/tasks=CASCADE(정상), finance/files/calendar=SET NULL(데이터 보존). 생성자 카드에만 노출 + Undo(행 재삽입).
  const deleteProject = async (p: ProjectRow) => {
    await mustOk(supabase.from("projects").delete().eq("id", p.id))
    setProjects((prev) => prev.filter((x) => x.id !== p.id))
    push({
      label: "프로젝트 삭제",
      undo: async () => {
        await mustOk(supabase.from("projects").insert(p))
        load()
      },
      redo: async () => {
        await mustOk(supabase.from("projects").delete().eq("id", p.id))
        setProjects((prev) => prev.filter((x) => x.id !== p.id))
      },
    })
  }

  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [profiles, setProfiles] = useState<Pick<Profile, "id" | "name" | "avatar_url" | "position">[]>([])
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
        supabase.from("profiles").select("id, name, avatar_url, position").order("name"),
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
      // 소프트삭제 제외는 클라 필터 — deleted_at 컬럼이 아직 없어도(마이그105 전) 안 깨지게(방어).
      setProjects(projData.filter((p) => !p.deleted_at))
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
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "", label: "상태: 전체" },
            ...PROJECT_STATUS_ORDER.map((s) => ({ value: s, label: PROJECT_STATUS[s].label })),
          ]}
        />
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
            return <ProjectCard key={p.id} project={p} members={members} me={me} onDelete={deleteProject} />
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

function ProjectCard({
  project: p,
  members,
  me,
  onDelete,
}: {
  project: ProjectRow
  members: MemberLite[]
  me: string | null
  onDelete: (p: ProjectRow) => void
}) {
  const st = PROJECT_STATUS[p.status as ProjectStatus]
  const pct = projectProgress(p)
  const canceled = p.status === "canceled"
  const canDelete = !!me && p.created_by === me
  return (
    <Link
      href={`/projects/${p.id}`}
      className="group hover-grow flex flex-col gap-3 rounded-xl glass p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn("min-w-0 flex-1 truncate font-semibold", canceled && "text-muted-foreground line-through")}>
          {p.name}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <ImportanceBadge value={p.importance ?? 0} />
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", st.badge)}>
            <st.icon className="size-3" />
            {st.label}
          </span>
          {canDelete && (
            <button
              type="button"
              onClick={(e) => {
                // 카드 전체가 Link라 클릭 전파/이동을 막고 삭제만 수행.
                e.preventDefault()
                e.stopPropagation()
                onDelete(p)
              }}
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              aria-label="프로젝트 삭제"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
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
        <Avatar key={m.id} size="sm" className="ring-2 ring-card" title={m.name + (m.position ? " · " + m.position : "")}>
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
  const me = useCurrentUserId()
  const { push } = useUndo()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<ProjectStatus>("planned")
  const [importance, setImportance] = useState(0)
  const [ownerId, setOwnerId] = useState("")
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [startDate, setStartDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleMember = (id: string) =>
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))

  const submit = async () => {
    if (!name.trim()) {
      setError("프로젝트명을 입력해 주세요.")
      return
    }
    setSaving(true)
    setError(null)
    if (!me) {
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
        importance,
        owner_id: ownerId || null,
        start_date: startDate || null,
        due_date: dueDate || null,
        created_by: me,
      })
      .select()
      .single()
    if (insErr) {
      setSaving(false)
      setError(insErr.message)
      return
    }
    // 참여 인원 등록(선택된 멤버 → project_members). 생성자가 created_by라 pm_insert RLS 통과.
    if (inserted && memberIds.length) {
      const { error: memErr } = await supabase
        .from("project_members")
        .insert(memberIds.map((uid) => ({ project_id: inserted.id, user_id: uid })))
      if (memErr) {
        setSaving(false)
        setError("프로젝트는 만들었지만 참여 인원 등록에 실패했어요: " + memErr.message)
        return
      }
    }
    setSaving(false)
    if (inserted) {
      // Undo=프로젝트 delete → project_members는 on delete cascade로 함께 제거(정합성 유지).
      push({
        label: "프로젝트 생성",
        undo: async () => {
          await supabase.from("projects").delete().eq("id", inserted.id)
        },
        redo: async () => {
          await supabase.from("projects").insert(inserted)
          if (memberIds.length) {
            await supabase
              .from("project_members")
              .insert(memberIds.map((uid) => ({ project_id: inserted.id, user_id: uid })))
          }
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
            중요도
            <select className={fieldClass} value={importance} onChange={(e) => setImportance(Number(e.target.value))}>
              {IMPORTANCE.map((lv) => (
                <option key={lv.value} value={lv.value}>
                  {lv.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2">
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
        {/* 참여 인원 — 생성 시 바로 지정(생성 후 상세에서도 추가/제거 가능) */}
        <div className="text-xs text-muted-foreground">
          참여 인원 {memberIds.length > 0 && <span className="text-foreground">· {memberIds.length}명</span>}
          {profiles.length === 0 ? (
            <p className="mt-1 text-muted-foreground">등록된 구성원이 없습니다.</p>
          ) : (
            <div className="mt-1 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border bg-card p-2">
              {profiles.map((p) => {
                const on = memberIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleMember(p.id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                      on ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {on && <Check className="size-3" />}
                    {p.name}
                  </button>
                )
              })}
            </div>
          )}
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
