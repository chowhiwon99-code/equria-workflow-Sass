"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { X, Plus, ExternalLink, Frame, FileText, Trash2, CalendarClock, Receipt, TrendingUp, ListChecks, Check, Loader2, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
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
import { dueBadge } from "@/lib/tasks"
import { PROJECT_STATUS, PROJECT_STATUS_ORDER } from "@/lib/projects"
import { IMPORTANCE, importanceLabel, importanceColor, tagBg } from "@/lib/meetingMeta"
import { isFigmaUrl, toFigmaDesktopUrl } from "@/lib/figma"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import type { Tables } from "@/lib/supabase/types"
import type { Project, ProjectStatus, Profile, DriveFile } from "@/types"

type ProjectTask = Tables<"project_tasks">

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

  const changeImportance = async (importance: number) => {
    const prev = project?.importance ?? 0
    if (prev === importance) return
    await supabase.from("projects").update({ importance }).eq("id", projectId)
    load()
    push({
      label: "프로젝트 중요도 변경",
      undo: async () => {
        await mustOk(supabase.from("projects").update({ importance: prev }).eq("id", projectId))
        load()
      },
      redo: async () => {
        await mustOk(supabase.from("projects").update({ importance }).eq("id", projectId))
        load()
      },
    })
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
          {(project.importance ?? 0) > 0 && (
            <span
              className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: tagBg(importanceColor(project.importance ?? 0)) }}
            >
              {importanceLabel(project.importance ?? 0)}
            </span>
          )}
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", st.badge)}>
            <span className="size-1.5 rounded-full" style={{ backgroundColor: st.dot }} />
            {st.label}
          </span>
        </div>
        {project.description && <p className="mt-1.5 text-sm text-muted-foreground">{project.description}</p>}
      </div>

      {/* 메타 카드 — 상태/담당자/일정 */}
      <div className="rounded-2xl glass p-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <MetaItem label="상태">
            <Select
              value={project.status}
              onChange={(v) => changeStatus(v as ProjectStatus)}
              options={PROJECT_STATUS_ORDER.map((s) => ({ value: s, label: PROJECT_STATUS[s].label }))}
              className="h-9 w-full"
            />
          </MetaItem>
          <MetaItem label="중요도">
            <Select
              value={String(project.importance ?? 0)}
              onChange={(v) => changeImportance(Number(v))}
              options={IMPORTANCE.map((lv) => ({ value: String(lv.value), label: lv.label }))}
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
      <section className="rounded-2xl glass p-5">
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

      {/* 체크리스트 — 프로젝트를 세부 할 일로 쪼갠다(팀 협업) */}
      <ChecklistSection projectId={projectId} />

      {/* 파일/링크 현황 */}
      <FilesSection projectId={projectId} />
    </div>
  )
}

/**
 * 프로젝트 체크리스트(project_tasks) — 프로젝트를 세부 할 일로 쪼개 진행률을 본다.
 * 같은 워크스페이스 멤버가 협업으로 추가/체크/삭제(094 EXISTS 격리). TodayTasks 시각 패턴 + FilesSection의 Undo 패턴 재사용.
 */
function ChecklistSection({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const me = useCurrentUserId()
  const { push } = useUndo()
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [title, setTitle] = useState("")
  const [due, setDue] = useState("")
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false) // 한글 IME Enter 이중발동·연타 방지

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("project_tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("done", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
    setTasks((data as ProjectTask[]) ?? [])
  }, [supabase, projectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const add = async () => {
    if (submitting.current) return
    const t = title.trim()
    if (!t) return
    submitting.current = true
    setBusy(true)
    try {
      const { data: inserted } = await supabase
        .from("project_tasks")
        .insert({ project_id: projectId, title: t, due_date: due || null, created_by: me })
        .select()
        .single()
      setTitle("")
      setDue("")
      await load()
      if (inserted) {
        push({
          label: "체크리스트 추가",
          undo: async () => {
            await mustOk(supabase.from("project_tasks").delete().eq("id", inserted.id))
            load()
          },
          redo: async () => {
            await mustOk(supabase.from("project_tasks").insert(inserted))
            load()
          },
        })
      }
    } catch {
      toast.error("추가에 실패했어요.")
    } finally {
      setBusy(false)
      submitting.current = false
    }
  }

  const toggle = async (task: ProjectTask) => {
    await supabase.from("project_tasks").update({ done: !task.done, updated_at: new Date().toISOString() }).eq("id", task.id)
    load()
    push({
      label: task.done ? "완료 취소" : "완료 체크",
      undo: async () => {
        await mustOk(supabase.from("project_tasks").update({ done: task.done }).eq("id", task.id))
        load()
      },
      redo: async () => {
        await mustOk(supabase.from("project_tasks").update({ done: !task.done }).eq("id", task.id))
        load()
      },
    })
  }

  const remove = async (id: string) => {
    const row = tasks.find((t) => t.id === id)
    await supabase.from("project_tasks").delete().eq("id", id)
    load()
    if (row) {
      push({
        label: "체크리스트 삭제",
        undo: async () => {
          await mustOk(supabase.from("project_tasks").insert(row))
          load()
        },
        redo: async () => {
          await mustOk(supabase.from("project_tasks").delete().eq("id", id))
          load()
        },
      })
    }
  }

  const doneCount = tasks.filter((t) => t.done).length
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0

  return (
    <section className="rounded-2xl glass p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="size-4 text-primary" /> 체크리스트
          {tasks.length > 0 && <span className="tabular-nums text-muted-foreground">{doneCount}/{tasks.length}</span>}
        </h2>
        {tasks.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
          </div>
        )}
      </div>

      {/* 추가 입력 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <input
          className={cn(fieldClass, "min-w-40 flex-1")}
          placeholder="세부 할 일을 입력하고 Enter"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            // 한글 IME 조합 확정 Enter는 무시(중복 추가 방지)
            if (e.key === "Enter" && !e.nativeEvent.isComposing) add()
          }}
        />
        <input type="date" className={cn(fieldClass, "w-36")} value={due} onChange={(e) => setDue(e.target.value)} title="기한(선택)" />
        <Button size="sm" onClick={add} disabled={busy || !title.trim()}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} 추가
        </Button>
      </div>

      {/* 목록 */}
      {tasks.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">프로젝트를 세부 할 일로 쪼개 진행 상황을 관리하세요.</p>
      ) : (
        <div className="mt-2 flex flex-col divide-y">
          {tasks.map((t) => {
            const d = t.due_date ? dueBadge(t.due_date) : null
            return (
              <div key={t.id} className="flex items-center gap-2 py-2">
                <button
                  onClick={() => toggle(t)}
                  aria-label={t.done ? "완료 취소" : "완료"}
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
                    t.done ? "border-primary bg-primary text-primary-foreground" : "border-input hover:border-primary"
                  )}
                >
                  {t.done && <Check className="size-3.5" />}
                </button>
                <span className={cn("min-w-0 flex-1 truncate text-sm", t.done && "text-muted-foreground line-through")}>{t.title}</span>
                {d && !t.done && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                      d.overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {d.text}
                  </span>
                )}
                <button
                  onClick={() => remove(t.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label="삭제"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
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
    <section className="rounded-2xl glass p-5">
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
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
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
    <div className="rounded-2xl glass p-4">
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
