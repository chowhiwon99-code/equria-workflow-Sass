"use client"

import { useCallback, useEffect, useState } from "react"
import { X, Plus, ExternalLink, Frame, FileText, Trash2, CalendarClock, Receipt, TrendingUp, type LucideIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Select } from "@/components/shared/Select"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { BackLink } from "@/components/shared/BackLink"
import { Loading, ErrorState } from "@/components/shared/States"
import { useUndo } from "@/components/undo/UndoProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { PROJECT_STATUS, PROJECT_STATUS_ORDER } from "@/lib/projects"
import { isFigmaUrl, toFigmaDesktopUrl } from "@/lib/figma"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import type { Project, ProjectStatus, Profile, DriveFile } from "@/types"

type MemberRow = { id: string; user_id: string; role: string; member: { name: string; position: string | null } | null }

export function ProjectDetail({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const { push } = useUndo()
  const [project, setProject] = useState<(Project & { owner: { name: string; position: string | null } | null }) | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [profiles, setProfiles] = useState<Pick<Profile, "id" | "name" | "position">[]>([])
  const [eventCount, setEventCount] = useState(0)
  const [financeTotal, setFinanceTotal] = useState<{ expense: number; revenue: number }>({ expense: 0, revenue: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: proj }, { data: mem }, { data: prof }, { count: evCount }, { data: fin }] = await Promise.all([
        supabase.from("projects").select("*, owner:profiles!projects_owner_id_fkey(name, position)").eq("id", projectId).single(),
        supabase.from("project_members").select("id, user_id, role, member:profiles!project_members_user_id_fkey(name, position)").eq("project_id", projectId),
        supabase.from("profiles").select("id, name, position").order("name"),
        supabase.from("calendar_events").select("id", { count: "exact", head: true }).eq("project_id", projectId),
        supabase.from("finance_entries").select("kind, total_amount").eq("project_id", projectId).is("deleted_at", null),
      ])
      setProject((proj as (Project & { owner: { name: string; position: string | null } | null }) | null) ?? null)
      setMembers((mem as MemberRow[]) ?? [])
      setProfiles(prof ?? [])
      setEventCount(evCount ?? 0)
      const totals = { expense: 0, revenue: 0 }
      for (const f of fin ?? []) {
        if (f.kind === "expense") totals.expense += Number(f.total_amount)
        else totals.revenue += Number(f.total_amount)
      }
      setFinanceTotal(totals)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "프로젝트 정보를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [supabase, projectId])

  useEffect(() => {
    load()
  }, [load])

  const changeStatus = async (status: ProjectStatus) => {
    const prev = project?.status as ProjectStatus | undefined
    await supabase.from("projects").update({ status }).eq("id", projectId)
    load()
    if (prev && prev !== status) {
      push({
        label: "프로젝트 상태 변경",
        undo: async () => {
          await mustOk(supabase.from("projects").update({ status: prev }).eq("id", projectId))
          load()
        },
        redo: async () => {
          await mustOk(supabase.from("projects").update({ status }).eq("id", projectId))
          load()
        },
      })
    }
  }

  const addMember = async (userId: string) => {
    if (!userId) return
    const { data: inserted } = await supabase
      .from("project_members")
      .insert({ project_id: projectId, user_id: userId })
      .select()
      .single()
    load()
    if (inserted) {
      push({
        label: "멤버 추가",
        undo: async () => {
          await mustOk(supabase.from("project_members").delete().eq("id", inserted.id))
          load()
        },
        redo: async () => {
          await mustOk(supabase.from("project_members").insert(inserted))
          load()
        },
      })
    }
  }

  const removeMember = async (id: string) => {
    const row = members.find((m) => m.id === id)
    await supabase.from("project_members").delete().eq("id", id)
    load()
    if (row) {
      push({
        label: "멤버 제거",
        undo: async () => {
          await mustOk(supabase.from("project_members").insert({ id: row.id, project_id: projectId, user_id: row.user_id, role: row.role }))
          load()
        },
        redo: async () => {
          await mustOk(supabase.from("project_members").delete().eq("id", id))
          load()
        },
      })
    }
  }

  if (loading) return <Loading rows={5} />
  if (error) return <ErrorState message={error} onRetry={() => { setError(null); load() }} />
  if (!project) return <p className="text-sm text-muted-foreground">프로젝트를 찾을 수 없습니다.</p>

  const memberIds = new Set(members.map((m) => m.user_id))
  const addable = profiles.filter((p) => !memberIds.has(p.id))
  const st = PROJECT_STATUS[project.status as ProjectStatus]

  return (
    <div className="flex flex-col gap-5">
      {/* 헤더 — 제목 + 상태 배지 */}
      <div>
        <BackLink href="/projects" label="프로젝트 목록" />
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", st.badge)}>
            <span className="size-1.5 rounded-full" style={{ backgroundColor: st.dot }} />
            {st.label}
          </span>
        </div>
        {project.description && <p className="mt-1.5 text-sm text-muted-foreground">{project.description}</p>}
      </div>

      {/* 메타 카드 — 상태/담당자/일정 */}
      <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-sm)]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <MetaItem label="상태">
            <Select
              value={project.status}
              onChange={(v) => changeStatus(v as ProjectStatus)}
              options={PROJECT_STATUS_ORDER.map((s) => ({ value: s, label: PROJECT_STATUS[s].label }))}
              className="h-9 w-full"
            />
          </MetaItem>
          <MetaItem label="담당자">
            {project.owner ? [project.owner.name, project.owner.position].filter(Boolean).join(" · ") : "미지정"}
          </MetaItem>
          <MetaItem label="시작일">{project.start_date ?? "—"}</MetaItem>
          <MetaItem label="종료예정">{project.due_date ?? "—"}</MetaItem>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard icon={CalendarClock} label="연결된 일정" value={`${eventCount}건`} accent="bg-muted text-foreground" />
        <SummaryCard icon={Receipt} label="비용 합계" value={`₩${financeTotal.expense.toLocaleString()}`} accent="bg-rose-100 text-rose-600" />
        <SummaryCard icon={TrendingUp} label="매출 합계" value={`₩${financeTotal.revenue.toLocaleString()}`} accent="bg-emerald-100 text-emerald-600" />
      </div>

      {/* 멤버 카드 */}
      <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-sm)]">
        <h2 className="text-sm font-semibold">
          참여 멤버 <span className="ml-0.5 text-muted-foreground tabular-nums">{members.length}</span>
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {members.length === 0 && <span className="text-sm text-muted-foreground">아직 참여 멤버가 없습니다.</span>}
          {members.map((m) => {
            const name = m.member?.name ?? "?"
            const pos = m.member?.position
            return (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card py-0.5 pl-0.5 pr-2 text-xs shadow-[var(--shadow-sm)]"
              >
                <Avatar size="sm" className="size-5">
                  <AvatarFallback className="text-[9px]">{name.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <span className="font-medium">
                  {name}
                  {pos && <span className="font-normal text-muted-foreground"> · {pos}</span>}
                </span>
                <button onClick={() => removeMember(m.id)} className="text-muted-foreground hover:text-destructive" aria-label="제거">
                  <X className="size-3" />
                </button>
              </span>
            )
          })}
          {addable.length > 0 && (
            <Select
              value=""
              onChange={(v) => addMember(v)}
              options={addable.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="+ 멤버 추가"
              className="h-7 rounded-full"
            />
          )}
        </div>
      </section>

      {/* 파일/링크 현황 */}
      <FilesSection projectId={projectId} />
    </div>
  )
}

function FilesSection({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const { push } = useUndo()
  const [files, setFiles] = useState<DriveFile[]>([])
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("files")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
    setFiles(data ?? [])
  }, [supabase, projectId])

  useEffect(() => {
    load()
  }, [load])

  const remove = async (id: string) => {
    const row = files.find((f) => f.id === id)
    await supabase.from("files").delete().eq("id", id)
    load()
    if (row) {
      push({
        label: "파일/링크 삭제",
        undo: async () => {
          await mustOk(supabase.from("files").insert(row))
          load()
        },
        redo: async () => {
          await mustOk(supabase.from("files").delete().eq("id", id))
          load()
        },
      })
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">파일 / 링크 현황</h2>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
          <Plus /> 파일/링크 추가
        </Button>
      </div>
      {files.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">등록된 파일/링크가 없습니다.</p>
      ) : (
        <div className="mt-3 flex flex-col divide-y rounded-xl border">
          {files.map((f) => {
            const figma = f.source === "figma" || (f.web_view_link ? isFigmaUrl(f.web_view_link) : false)
            return (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                {figma ? <Frame className="size-4 text-[#A259FF]" /> : <FileText className="size-4 text-muted-foreground" />}
                <span className="flex-1 truncate text-sm font-medium">{f.name}</span>
                {f.web_view_link && figma && (
                  <a
                    href={toFigmaDesktopUrl(f.web_view_link)}
                    className="inline-flex items-center gap-1 rounded-md bg-[#A259FF]/10 px-2 py-1 text-xs text-[#A259FF] hover:bg-[#A259FF]/20"
                  >
                    <Frame className="size-3" /> 앱에서 열기
                  </a>
                )}
                {f.web_view_link && (
                  <a
                    href={f.web_view_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="size-3" /> 열기
                  </a>
                )}
                <button onClick={() => remove(f.id)} className="text-muted-foreground hover:text-destructive" aria-label="삭제">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
      {showAdd && (
        <AddFileModal
          projectId={projectId}
          reload={load}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            load()
          }}
        />
      )}
    </section>
  )
}

function AddFileModal({
  projectId,
  reload,
  onClose,
  onAdded,
}: {
  projectId: string
  reload: () => void
  onClose: () => void
  onAdded: () => void
}) {
  const supabase = createClient()
  const me = useCurrentUserId()
  const { push } = useUndo()
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim() || !url.trim()) {
      setError("이름과 URL을 입력해 주세요.")
      return
    }
    setSaving(true)
    setError(null)
    const source = isFigmaUrl(url) ? "figma" : "link"
    const { data: inserted, error: insErr } = await supabase
      .from("files")
      .insert({
        name: name.trim(),
        web_view_link: url.trim(),
        source,
        project_id: projectId,
        owner_id: me,
      })
      .select()
      .single()
    setSaving(false)
    if (insErr) return setError(insErr.message)
    if (inserted) {
      push({
        label: "파일/링크 추가",
        undo: async () => {
          await mustOk(supabase.from("files").delete().eq("id", inserted.id))
          reload()
        },
        redo: async () => {
          await mustOk(supabase.from("files").insert(inserted))
          reload()
        },
      })
    }
    onAdded()
  }

  return (
    <Modal title="파일 / 링크 추가" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input className={fieldClass} placeholder="이름 (예: 패키지 디자인 시안)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <input className={fieldClass} placeholder="URL (Figma·Drive·문서 링크 등)" value={url} onChange={(e) => setUrl(e.target.value)} />
        {isFigmaUrl(url) && (
          <p className="flex items-center gap-1 text-xs text-[#A259FF]">
            <Frame className="size-3" /> Figma 링크로 인식됨 — &lsquo;앱에서 열기&rsquo; 버튼이 추가됩니다.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "저장 중…" : "추가"}</Button>
        </div>
      </div>
    </Modal>
  )
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="text-sm font-medium">{children}</div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", accent)}>
          <Icon className="size-4" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2.5 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
