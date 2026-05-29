"use client"

import { useCallback, useEffect, useState } from "react"
import { UserPlus, X, Plus, ExternalLink, Frame, FileText, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { BackLink } from "@/components/shared/BackLink"
import { PROJECT_STATUS, PROJECT_STATUS_ORDER } from "@/lib/projects"
import { isFigmaUrl, toFigmaDesktopUrl } from "@/lib/figma"
import type { Project, ProjectStatus, Profile, DriveFile } from "@/types"

type MemberRow = { id: string; user_id: string; role: string; member: { name: string } | null }

export function ProjectDetail({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [project, setProject] = useState<(Project & { owner: { name: string } | null }) | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [profiles, setProfiles] = useState<Pick<Profile, "id" | "name">[]>([])
  const [eventCount, setEventCount] = useState(0)
  const [financeTotal, setFinanceTotal] = useState<{ expense: number; revenue: number }>({ expense: 0, revenue: 0 })
  const [loading, setLoading] = useState(true)
  const [addUserId, setAddUserId] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: proj }, { data: mem }, { data: prof }, { count: evCount }, { data: fin }] = await Promise.all([
      supabase.from("projects").select("*, owner:profiles!projects_owner_id_fkey(name)").eq("id", projectId).single(),
      supabase.from("project_members").select("id, user_id, role, member:profiles!project_members_user_id_fkey(name)").eq("project_id", projectId),
      supabase.from("profiles").select("id, name").order("name"),
      supabase.from("calendar_events").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      supabase.from("finance_entries").select("kind, total_amount").eq("project_id", projectId),
    ])
    setProject((proj as (Project & { owner: { name: string } | null }) | null) ?? null)
    setMembers((mem as MemberRow[]) ?? [])
    setProfiles(prof ?? [])
    setEventCount(evCount ?? 0)
    const totals = { expense: 0, revenue: 0 }
    for (const f of fin ?? []) {
      if (f.kind === "expense") totals.expense += Number(f.total_amount)
      else totals.revenue += Number(f.total_amount)
    }
    setFinanceTotal(totals)
    setLoading(false)
  }, [supabase, projectId])

  useEffect(() => {
    load()
  }, [load])

  const changeStatus = async (status: ProjectStatus) => {
    await supabase.from("projects").update({ status }).eq("id", projectId)
    load()
  }

  const addMember = async () => {
    if (!addUserId) return
    await supabase.from("project_members").insert({ project_id: projectId, user_id: addUserId })
    setAddUserId("")
    load()
  }

  const removeMember = async (id: string) => {
    await supabase.from("project_members").delete().eq("id", id)
    load()
  }

  if (loading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>
  if (!project) return <p className="text-sm text-muted-foreground">프로젝트를 찾을 수 없습니다.</p>

  const memberIds = new Set(members.map((m) => m.user_id))
  const addable = profiles.filter((p) => !memberIds.has(p.id))

  return (
    <div className="flex flex-col gap-5">
      <div>
        <BackLink href="/projects" label="프로젝트 목록" />
        <h1 className="mt-2 text-xl font-semibold">{project.name}</h1>
        {project.description && <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>}
      </div>

      {/* 메타 정보 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="상태">
          <select
            className={cn(fieldClass, "w-auto")}
            value={project.status}
            onChange={(e) => changeStatus(e.target.value as ProjectStatus)}
          >
            {PROJECT_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS[s].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="담당자">{project.owner?.name ?? "미지정"}</Field>
        <Field label="시작일">{project.start_date ?? "—"}</Field>
        <Field label="종료예정">{project.due_date ?? "—"}</Field>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="연결된 일정" value={`${eventCount}건`} />
        <SummaryCard label="비용 합계" value={`₩${financeTotal.expense.toLocaleString()}`} />
        <SummaryCard label="매출 합계" value={`₩${financeTotal.revenue.toLocaleString()}`} />
      </div>

      {/* 멤버 */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">참여 멤버</h2>
        <div className="flex flex-wrap gap-2">
          {members.length === 0 && <span className="text-sm text-muted-foreground">참여 멤버가 없습니다.</span>}
          {members.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
              {m.member?.name ?? "(알 수 없음)"}
              <button onClick={() => removeMember(m.id)} className="text-muted-foreground hover:text-destructive" aria-label="제거">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        {addable.length > 0 && (
          <div className="flex items-center gap-2">
            <select className={cn(fieldClass, "w-auto")} value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
              <option value="">멤버 선택…</option>
              {addable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={addMember} disabled={!addUserId}>
              <UserPlus /> 추가
            </Button>
          </div>
        )}
      </div>

      {/* 파일/링크 현황 */}
      <FilesSection projectId={projectId} />
    </div>
  )
}

function FilesSection({ projectId }: { projectId: string }) {
  const supabase = createClient()
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
    await supabase.from("files").delete().eq("id", id)
    load()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">파일 / 링크 현황</h2>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
          <Plus /> 파일/링크 추가
        </Button>
      </div>
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 파일/링크가 없습니다.</p>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
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
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function AddFileModal({
  projectId,
  onClose,
  onAdded,
}: {
  projectId: string
  onClose: () => void
  onAdded: () => void
}) {
  const supabase = createClient()
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
    const { data: auth } = await supabase.auth.getUser()
    const source = isFigmaUrl(url) ? "figma" : "link"
    const { error: insErr } = await supabase.from("files").insert({
      name: name.trim(),
      web_view_link: url.trim(),
      source,
      project_id: projectId,
      owner_id: auth.user?.id ?? null,
    })
    setSaving(false)
    if (insErr) return setError(insErr.message)
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
