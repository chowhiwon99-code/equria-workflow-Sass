"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
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
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { money } from "@/lib/finance"
import { aggregateByCurrency } from "@/components/finance/financeAgg"
import { FinanceEntryModal } from "@/components/finance/FinanceEntryModal"
import { combineDateTimeToIso, toDateInputValue } from "@/lib/calendar"
import type { Tables } from "@/lib/supabase/types"
import type { Project, ProjectStatus, Profile, DriveFile } from "@/types"

type ProjectTask = Tables<"project_tasks">

type MemberRow = { id: string; user_id: string; role: string; member: { name: string; position: string | null } | null }

export function ProjectDetail({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const { push } = useUndo()
  const me = useCurrentUserId()
  const router = useRouter()
  const [project, setProject] = useState<(Project & { owner: { name: string; position: string | null } | null }) | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [profiles, setProfiles] = useState<Pick<Profile, "id" | "name" | "position">[]>([])
  const [eventCount, setEventCount] = useState(0)
  // 통화별 {비용,매출} — 하위 FinanceSection이 로드/변경 시 콜백으로 올려준다(통화 섞임 방지).
  const [financeByCur, setFinanceByCur] = useState<Record<string, { revenue: number; expense: number }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 일정 수·재무 합계는 하위 섹션이 소유하고 콜백으로 올린다. 여기선 프로젝트/멤버/후보만.
      const [{ data: proj }, { data: mem }, { data: prof }] = await Promise.all([
        supabase.from("projects").select("*, owner:profiles!projects_owner_id_fkey(name, position)").eq("id", projectId).single(),
        supabase.from("project_members").select("id, user_id, role, member:profiles!project_members_user_id_fkey(name, position)").eq("project_id", projectId),
        supabase.from("profiles").select("id, name, position").order("name"),
      ])
      setProject((proj as (Project & { owner: { name: string; position: string | null } | null }) | null) ?? null)
      setMembers((mem as MemberRow[]) ?? [])
      setProfiles(prof ?? [])
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

  // 참고사항 메모 저장(blur 시). 멤버도 수정 가능(105 RLS). 값이 그대로면 no-op.
  const saveNotes = async (val: string) => {
    const next = val.trim() ? val : null
    if ((project?.notes ?? null) === next) return
    await supabase.from("projects").update({ notes: next }).eq("id", projectId)
    load()
  }

  // 프로젝트 삭제 = 하드삭제(기존 DELETE RLS=created_by, 마이그 불필요·즉시 동작).
  // FK: members/tasks=CASCADE, finance/files/calendar=SET NULL(보존). 생성자만 버튼 노출 → 목록 이동 + Undo(행 재삽입).
  const deleteProject = async () => {
    if (!project) return
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- owner(조인)만 떼고 나머지 컬럼을 재삽입용으로 보관
    const { owner, ...row } = project
    await mustOk(supabase.from("projects").delete().eq("id", projectId))
    router.push("/projects")
    push({
      label: "프로젝트 삭제",
      undo: async () => {
        await mustOk(supabase.from("projects").insert(row))
      },
      redo: async () => {
        await mustOk(supabase.from("projects").delete().eq("id", projectId))
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

  // 요약 카드용 재무 집계 — 대표 통화(KRW 우선, 없으면 첫 통화). 전체 통화 분해는 아래 정산 섹션이 보여준다.
  const finCurs = Object.keys(financeByCur)
  const primaryCur = finCurs.includes("KRW") ? "KRW" : finCurs[0] ?? "KRW"
  const finPrimary = financeByCur[primaryCur] ?? { revenue: 0, expense: 0 }
  const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })

  return (
    <div className="flex flex-col gap-5">
      {/* 헤더 — 제목 + 상태 배지 + (생성자) 삭제 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
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
            <st.icon className="size-3.5" />
            {st.label}
          </span>
        </div>
        {project.description && <p className="mt-1.5 text-sm text-muted-foreground">{project.description}</p>}
        </div>
        {me && project.created_by && me === project.created_by && (
          <button
            onClick={deleteProject}
            className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="프로젝트 삭제"
          >
            <Trash2 className="size-4" />
            삭제
          </button>
        )}
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

      {/* 요약 카드 — 클릭 시 해당 섹션으로 스크롤(살아있는 진입점) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard icon={CalendarClock} label="연결된 일정" value={`${eventCount}건`} accent="bg-muted text-foreground" onClick={() => scrollToId("project-schedule")} />
        <SummaryCard icon={Receipt} label="비용 합계" value={money(finPrimary.expense, primaryCur)} accent="bg-rose-100 text-rose-600" onClick={() => scrollToId("project-finance")} />
        <SummaryCard icon={TrendingUp} label="매출 합계" value={money(finPrimary.revenue, primaryCur)} accent="bg-emerald-100 text-emerald-600" onClick={() => scrollToId("project-finance")} />
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

      {/* 연결된 일정 — 이 프로젝트에 회의·마감 일정 연결(캘린더 project_id) */}
      <ScheduleSection projectId={projectId} onCount={setEventCount} />

      {/* 비용·매출 정산 — 이 프로젝트에 든 비용/나온 매출 연결(재무 project_id) + 통화별 순익 */}
      <FinanceSection projectId={projectId} onSummary={setFinanceByCur} />

      {/* 체크리스트 — 프로젝트를 세부 할 일로 쪼갠다(팀 협업) */}
      <ChecklistSection projectId={projectId} />

      {/* 파일/링크 현황 */}
      <FilesSection projectId={projectId} />

      {/* 참고사항 메모 — blur 시 저장(멤버 공유). uncontrolled=재로드에도 타이핑 보존 */}
      <section className="rounded-2xl glass p-5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <FileText className="size-4 text-primary" /> 참고사항
        </h2>
        <textarea
          key={project.id}
          defaultValue={project.notes ?? ""}
          onBlur={(e) => saveNotes(e.target.value)}
          placeholder="프로젝트 관련 참고사항·메모를 남겨보세요. (예: 논의 내용, 링크, 주의사항)"
          rows={4}
          className="mt-3 w-full resize-y rounded-xl border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        />
      </section>
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

/**
 * 연결된 일정 — 이 프로젝트에 회의·마감 일정을 연결(calendar_events.project_id).
 * ChecklistSection의 인라인 추가(제목+날짜+Enter, IME 이중입력 차단) 패턴 재사용.
 */
type ProjectEvent = Pick<Tables<"calendar_events">, "id" | "title" | "start_time" | "created_by" | "project_id" | "all_day">
const EVENT_COLS = "id, title, start_time, created_by, project_id, all_day"

function ScheduleSection({ projectId, onCount }: { projectId: string; onCount: (n: number) => void }) {
  const supabase = createClient()
  const me = useCurrentUserId()
  const wsId = useCurrentWorkspaceId()
  const { push } = useUndo()
  const [events, setEvents] = useState<ProjectEvent[]>([])
  const [title, setTitle] = useState("")
  const [date, setDate] = useState(() => toDateInputValue(new Date()))
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("calendar_events")
      .select(EVENT_COLS)
      .eq("project_id", projectId)
      .order("start_time", { ascending: true })
    const rows = (data as ProjectEvent[]) ?? []
    setEvents(rows)
    onCount(rows.length)
  }, [supabase, projectId, onCount])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const add = async () => {
    const t = title.trim()
    if (!t || !date || !me || submitting.current) return
    submitting.current = true
    setBusy(true)
    const { data: inserted } = await supabase
      .from("calendar_events")
      .insert({
        title: t,
        start_time: combineDateTimeToIso(date, "00:00"),
        all_day: true,
        project_id: projectId,
        created_by: me,
        ...(wsId ? { workspace_id: wsId } : {}),
      })
      .select(EVENT_COLS)
      .single()
    setBusy(false)
    submitting.current = false
    if (inserted) {
      setTitle("")
      await load()
      push({
        label: "일정 추가",
        undo: async () => { await mustOk(supabase.from("calendar_events").delete().eq("id", inserted.id)); load() },
        redo: async () => { await mustOk(supabase.from("calendar_events").insert(inserted)); load() },
      })
    }
  }

  const remove = async (ev: ProjectEvent) => {
    await mustOk(supabase.from("calendar_events").delete().eq("id", ev.id))
    load()
    push({
      label: "일정 삭제",
      undo: async () => { await mustOk(supabase.from("calendar_events").insert(ev)); load() },
      redo: async () => { await mustOk(supabase.from("calendar_events").delete().eq("id", ev.id)); load() },
    })
  }

  return (
    <section id="project-schedule" className="scroll-mt-20 rounded-2xl glass p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <CalendarClock className="size-4 text-primary" /> 연결된 일정
        <span className="ml-0.5 text-muted-foreground tabular-nums">{events.length}</span>
      </h2>
      <div className="mt-3 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) add() }}
          placeholder="일정 제목 (예: 킥오프 미팅)"
          className={cn(fieldClass, "flex-1")}
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(fieldClass, "w-40")} />
        <Button size="sm" onClick={add} disabled={busy || !title.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {events.length === 0 && <li className="text-sm text-muted-foreground">아직 연결된 일정이 없어요.</li>}
        {events.map((ev) => (
          <li key={ev.id} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm">
            <span className="min-w-0 truncate">{ev.title}</span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">{ev.start_time?.slice(0, 10)}</span>
              <button onClick={() => remove(ev)} className="text-muted-foreground hover:text-destructive" aria-label="삭제"><Trash2 className="size-3.5" /></button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * 비용·매출 정산 — 이 프로젝트에 든 비용/나온 매출을 연결(finance_entries.project_id).
 * FinanceEntryModal 재사용(projectId 주입) + 통화별 합계·순익(financeAgg.aggregateByCurrency).
 */
type ProjectFinance = Pick<Tables<"finance_entries">, "id" | "kind" | "category" | "total_amount" | "currency" | "entry_date">

function FinanceSection({ projectId, onSummary }: { projectId: string; onSummary: (byCur: Record<string, { revenue: number; expense: number }>) => void }) {
  const supabase = createClient()
  const { push } = useUndo()
  const [rows, setRows] = useState<ProjectFinance[]>([])
  const [modal, setModal] = useState<null | "expense" | "revenue">(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("finance_entries")
      .select("id, kind, category, total_amount, currency, entry_date")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("entry_date", { ascending: false })
    const list = (data as ProjectFinance[]) ?? []
    setRows(list)
    onSummary(aggregateByCurrency(list))
  }, [supabase, projectId, onSummary])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const remove = async (r: ProjectFinance) => {
    const now = new Date().toISOString()
    await mustOk(supabase.from("finance_entries").update({ deleted_at: now }).eq("id", r.id))
    load()
    push({
      label: "정산 항목 삭제",
      undo: async () => { await mustOk(supabase.from("finance_entries").update({ deleted_at: null }).eq("id", r.id)); load() },
      redo: async () => { await mustOk(supabase.from("finance_entries").update({ deleted_at: now }).eq("id", r.id)); load() },
    })
  }

  const byCur = aggregateByCurrency(rows)
  const curs = Object.keys(byCur)

  return (
    <section id="project-finance" className="scroll-mt-20 rounded-2xl glass p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Receipt className="size-4 text-primary" /> 비용·매출 정산
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setModal("expense")}><Plus className="size-3.5" /> 비용</Button>
          <Button size="sm" variant="outline" onClick={() => setModal("revenue")}><Plus className="size-3.5" /> 매출</Button>
        </div>
      </div>

      {curs.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">아직 연결된 비용·매출이 없어요. 오른쪽 위 버튼으로 추가하세요.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {curs.map((cur) => {
            const s = byCur[cur]
            const net = s.revenue - s.expense
            return (
              <div key={cur} className="flex flex-wrap items-center justify-between gap-1 rounded-lg border bg-card px-3 py-2 text-sm tabular-nums">
                <span className="text-muted-foreground">비용 {money(s.expense, cur)} · 매출 {money(s.revenue, cur)}</span>
                <span className={cn("font-semibold", net >= 0 ? "text-emerald-600" : "text-rose-600")}>순익 {net >= 0 ? "+" : ""}{money(net, cur)}</span>
              </div>
            )
          })}
        </div>
      )}

      {rows.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-1 py-1 text-sm">
              <span className="min-w-0 truncate">
                <span className={cn("mr-1.5 inline-block size-1.5 rounded-full align-middle", r.kind === "revenue" ? "bg-emerald-500" : "bg-rose-500")} />
                {r.category || (r.kind === "revenue" ? "매출" : "비용")}
                <span className="ml-1.5 text-xs text-muted-foreground">{r.entry_date}</span>
              </span>
              <div className="flex shrink-0 items-center gap-2 tabular-nums">
                <span className={r.kind === "revenue" ? "text-emerald-600" : "text-rose-600"}>
                  {r.kind === "revenue" ? "+" : "−"}{money(Number(r.total_amount), r.currency || "KRW")}
                </span>
                <button onClick={() => remove(r)} className="text-muted-foreground hover:text-destructive" aria-label="삭제"><Trash2 className="size-3.5" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <FinanceEntryModal
          entry={null}
          projectId={projectId}
          defaultKind={modal}
          reload={load}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </section>
  )
}

function SummaryCard({ icon: Icon, label, value, accent, onClick }: { icon: LucideIcon; label: string; value: string; accent: string; onClick?: () => void }) {
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", accent)}>
          <Icon className="size-4" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2.5 text-2xl font-semibold tabular-nums">{value}</p>
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="hover-grow rounded-2xl glass p-4 text-left transition-transform">
        {inner}
      </button>
    )
  }
  return <div className="rounded-2xl glass p-4">{inner}</div>
}
