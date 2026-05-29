"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Plus, FolderKanban, ChevronRight } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { useUndo } from "@/components/undo/UndoProvider"
import { PROJECT_STATUS, PROJECT_STATUS_ORDER } from "@/lib/projects"
import type { Project, ProjectStatus, Profile } from "@/types"

type ProjectRow = Project & { owner: { name: string } | null }

const PAGE_SIZE = 50

export function ProjectsView() {
  const supabase = createClient()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [profiles, setProfiles] = useState<Pick<Profile, "id" | "name">[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [pageCount, setPageCount] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from("projects")
      .select("*, owner:profiles!projects_owner_id_fkey(name)", { count: "exact" })
    if (statusFilter) q = q.eq("status", statusFilter)
    if (searchText.trim()) {
      const s = `%${searchText.trim()}%`
      q = q.or(`name.ilike.${s},description.ilike.${s}`)
    }
    const [projRes, profRes] = await Promise.all([
      q.order("created_at", { ascending: false }).range(0, pageCount * PAGE_SIZE - 1),
      supabase.from("profiles").select("id, name").order("name"),
    ])
    setProjects((projRes.data as ProjectRow[]) ?? [])
    setTotalCount(projRes.count ?? 0)
    setProfiles(profRes.data ?? [])
    setLoading(false)
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
          className="h-8 w-56 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="프로젝트명·설명 검색…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <select
          className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <FolderKanban className="size-8" />
          <p className="text-sm">아직 프로젝트가 없습니다. 첫 프로젝트를 만들어 보세요.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm tabular-nums [&_td]:align-middle [&_th]:align-middle">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">프로젝트명</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">담당자</th>
                <th className="px-3 py-2 font-medium">시작일</th>
                <th className="px-3 py-2 font-medium">종료예정</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const st = PROJECT_STATUS[p.status as ProjectStatus]
                return (
                  <tr key={p.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2 align-middle">
                      <Link
                        href={`/projects/${p.id}`}
                        className="group inline-flex origin-left items-center gap-1 font-medium transition-all duration-150 hover:scale-[1.04] hover:text-primary"
                      >
                        {p.name}
                        <ChevronRight className="size-3.5 -translate-x-1 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100" />
                      </Link>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", st.badge)}>
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: st.dot }} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle text-muted-foreground">{p.owner?.name ?? "—"}</td>
                    <td className="px-3 py-2 align-middle text-muted-foreground">{p.start_date ?? "—"}</td>
                    <td className="px-3 py-2 align-middle text-muted-foreground">{p.due_date ?? "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
