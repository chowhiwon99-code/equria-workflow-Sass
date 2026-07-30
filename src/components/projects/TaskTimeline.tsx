"use client"

import { useCallback, useEffect, useState } from "react"
import { Paperclip, Plus, Trash2, ExternalLink, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { mustOk } from "@/lib/supabase/mustOk"
import { uploadFile } from "@/lib/upload"
import { FILES_BUCKET } from "@/lib/files"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import type { Tables } from "@/lib/supabase/types"

/**
 * 태스크(체크리스트) 타임라인 — 노션식(세션41 대표 요청).
 * 기한 있는 할 일을 기간 바로 시각화: 드래그=이동, 양끝=시작/기한 조절, 📎=일정별 파일 추가/빼기.
 * 시작일 없는 할 일은 기한 하루짜리 바 — 왼쪽 끝을 끌면 기간이 생긴다. 데이터: 마이그123(start_date·files.project_task_id).
 */

type ProjectTask = Tables<"project_tasks">
type TaskFile = Pick<Tables<"files">, "id" | "name" | "web_view_link" | "project_task_id">

const PPD = 8 // px per day (상세 화면은 더 크게)
const ROW_H = 40
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

export function TaskTimeline({
  projectId,
  tasks,
  onMoveTask,
}: {
  projectId: string
  tasks: ProjectTask[]
  onMoveTask: (t: ProjectTask, newStart: string | null, newDue: string) => void
}) {
  const supabase = createClient()
  const me = useCurrentUserId()
  const wsId = useCurrentWorkspaceId()
  const [drag, setDrag] = useState<DragState | null>(null)
  const [openFiles, setOpenFiles] = useState<string | null>(null) // 파일 스트립이 열린 태스크
  const [files, setFiles] = useState<TaskFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")

  const dated = tasks.filter((t) => t.due_date)
  const today = todayStr()
  const todayT = d0(today)

  const loadFiles = useCallback(async () => {
    const ids = tasks.map((t) => t.id)
    if (ids.length === 0) return setFiles([])
    const { data } = await supabase.from("files").select("id, name, web_view_link, project_task_id").in("project_task_id", ids)
    setFiles((data as TaskFile[]) ?? [])
  }, [supabase, tasks])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 태스크 목록 변경 시 파일 재로드
    loadFiles()
  }, [loadFiles])

  if (dated.length === 0) return null

  // 축 범위 — 태스크 기간 전체 + 오늘, 여백
  const startsOf = (t: ProjectTask) => d0((t.start_date ?? t.due_date) as string)
  const lo = Math.min(...dated.map(startsOf), todayT) - 7 * DAY
  const hi = Math.max(...dated.map((t) => d0(t.due_date as string)), todayT) + 21 * DAY
  const width = Math.ceil((hi - lo) / DAY) * PPD
  const x = (t: number) => ((t - lo) / DAY) * PPD

  // 월 눈금
  const months: { x: number; label: string }[] = []
  {
    const c = new Date(lo)
    c.setDate(1)
    c.setHours(0, 0, 0, 0)
    while (c.getTime() <= hi) {
      if (c.getTime() >= lo) months.push({ x: ((c.getTime() - lo) / DAY) * PPD, label: `${c.getMonth() + 1}월` })
      c.setMonth(c.getMonth() + 1)
    }
  }

  const startDrag = (e: React.PointerEvent, t: ProjectTask, mode: DragState["mode"]) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const onMoveEv = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      setDrag({ id: t.id, mode, startX, dDays: Math.round(dx / PPD), moved: Math.abs(dx) > 4 })
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMoveEv)
      window.removeEventListener("pointerup", onUp)
      const dDays = Math.round((ev.clientX - startX) / PPD)
      const moved = Math.abs(ev.clientX - startX) > 4
      setDrag(null)
      if (!moved) return
      const s = t.start_date ?? (t.due_date as string)
      const d = t.due_date as string
      if (mode === "move") onMoveTask(t, t.start_date ? addDays(s, dDays) : null, addDays(d, dDays))
      else if (mode === "start") {
        const ns = addDays(s, dDays)
        onMoveTask(t, d0(ns) > d0(d) ? d : ns, d)
      } else {
        const nd = addDays(d, dDays)
        onMoveTask(t, t.start_date, d0(nd) < d0(s) ? s : nd)
      }
    }
    window.addEventListener("pointermove", onMoveEv)
    window.addEventListener("pointerup", onUp)
    setDrag({ id: t.id, mode, startX, dDays: 0, moved: false })
  }

  // ── 일정별 파일 추가/빼기 ──
  const addUpload = async (taskId: string, file: File) => {
    if (!me || !wsId) return
    setUploading(true)
    try {
      const up = await uploadFile(FILES_BUCKET, file)
      await mustOk(
        supabase.from("files").insert({
          workspace_id: wsId as string,
          source: "local",
          name: up.name,
          mime_type: up.mimeType,
          size_bytes: up.size,
          owner_id: me,
          project_id: projectId,
          project_task_id: taskId,
          metadata: { storage_path: up.path },
        })
      )
      loadFiles()
    } catch {
      toast.error("업로드에 실패했어요.")
    } finally {
      setUploading(false)
    }
  }

  const addLink = async (taskId: string) => {
    const url = linkUrl.trim()
    if (!url || !me || !wsId) return
    try {
      await mustOk(
        supabase.from("files").insert({
          workspace_id: wsId as string,
          source: "link",
          name: url.replace(/^https?:\/\//, "").slice(0, 80),
          web_view_link: url.startsWith("http") ? url : `https://${url}`,
          owner_id: me,
          project_id: projectId,
          project_task_id: taskId,
        })
      )
      setLinkUrl("")
      loadFiles()
    } catch {
      toast.error("링크 추가에 실패했어요.")
    }
  }

  const removeFile = async (f: TaskFile) => {
    await mustOk(supabase.from("files").update({ project_task_id: null }).eq("id", f.id)) // 연결만 해제(파일 보존)
    loadFiles()
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border">
      <div className="relative" style={{ width, minWidth: "100%" }}>
        {months.map((m) => (
          <div key={m.x} className="absolute inset-y-0 w-px bg-border/60" style={{ left: m.x }} />
        ))}
        <div className="absolute inset-y-0 z-10 w-px bg-rose-400" style={{ left: x(todayT) }} />
        <div className="relative h-7 border-b">
          {months.map((m) => (
            <span key={m.x} className="absolute top-1.5 text-[10px] font-medium text-muted-foreground" style={{ left: m.x + 5 }}>
              {m.label}
            </span>
          ))}
          <span className="absolute top-1 z-10 -translate-x-1/2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums" style={{ left: x(todayT) }} title="오늘">
            {Number(today.slice(8, 10))}
          </span>
        </div>

        {dated.map((t) => {
          const isDrag = drag?.id === t.id
          const shift = isDrag ? (drag as DragState).dDays * PPD : 0
          const s = (t.start_date ?? t.due_date) as string
          const d = t.due_date as string
          const left = x(d0(s)) + (isDrag && (drag as DragState).mode !== "due" ? shift : 0)
          const right = x(d0(d)) + PPD + (isDrag && (drag as DragState).mode !== "start" ? shift : 0)
          const w = Math.max(PPD, right - left)
          const overdue = !t.done && d < today
          const taskFiles = files.filter((f) => f.project_task_id === t.id)
          const filesOpen = openFiles === t.id
          return (
            <div key={t.id}>
              <div className="relative" style={{ height: ROW_H }}>
                <div className="absolute top-1" style={{ left }}>
                  <div
                    onPointerDown={(e) => startDrag(e, t, "move")}
                    className={cn(
                      "group relative h-7 rounded-lg border shadow-sm",
                      isDrag ? "cursor-grabbing" : "cursor-grab",
                      t.done ? "border-success/40 bg-success-bg" : overdue ? "border-rose-300 bg-rose-500/10" : "border-info/40 bg-info-bg"
                    )}
                    style={{ width: w }}
                    title={`${t.title} · ${t.start_date ? `${s} ~ ` : "기한 "}${d} — 드래그로 이동, 양끝으로 기간 조절`}
                  >
                    <div onPointerDown={(e) => startDrag(e, t, "start")} className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l-lg" title="시작일 조절(끌면 기간 생성)" />
                    <div onPointerDown={(e) => startDrag(e, t, "due")} className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r-lg" title="기한 조절" />
                    <div className="absolute inset-y-0 left-2 z-[5] flex items-center gap-1.5 whitespace-nowrap text-xs">
                      <span className={cn("font-medium", t.done && "text-muted-foreground line-through")}>{t.title}</span>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenFiles(filesOpen ? null : t.id)
                          setLinkUrl("")
                        }}
                        className={cn("inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] transition-colors hover:bg-background/80", taskFiles.length > 0 ? "text-foreground" : "text-muted-foreground")}
                        title="일정 파일 추가/빼기"
                      >
                        <Paperclip className="size-3" />
                        {taskFiles.length > 0 && <span className="tabular-nums">{taskFiles.length}</span>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {/* 파일 스트립 — 이 일정에 붙은 파일/링크(추가·빼기) */}
              {filesOpen && (
                <div className="border-y bg-muted/20 px-3 py-2">
                  <div className="sticky left-3 flex w-fit max-w-full flex-wrap items-center gap-1.5 text-xs">
                    {taskFiles.map((f) => (
                      <span key={f.id} className="inline-flex items-center gap-1 rounded-full border bg-card py-0.5 pl-2 pr-1.5">
                        <FileText className="size-3 text-muted-foreground" />
                        <span className="max-w-40 truncate">{f.name}</span>
                        {f.web_view_link && (
                          <a href={f.web_view_link} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title="열기">
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                        <button onClick={() => removeFile(f)} className="text-muted-foreground hover:text-destructive" aria-label="빼기" title="이 일정에서 빼기(파일은 보존)">
                          <Trash2 className="size-3" />
                        </button>
                      </span>
                    ))}
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-muted-foreground transition-colors hover:text-foreground">
                      {uploading ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />} 파일
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) addUpload(t.id, f)
                          e.currentTarget.value = ""
                        }}
                      />
                    </label>
                    <input
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) addLink(t.id)
                      }}
                      placeholder="링크 붙여넣고 Enter"
                      className="h-6 w-44 rounded-full border bg-background px-2 text-[11px] outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div className="h-2" />
      </div>
    </div>
  )
}
