"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Paperclip, Plus, Trash2, ExternalLink, FileText, Loader2, CalendarRange } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { mustOk } from "@/lib/supabase/mustOk"
import { uploadFile } from "@/lib/upload"
import { FILES_BUCKET } from "@/lib/files"
import { DateInput } from "@/components/shared/DateInput"
import { CATEGORY_COLORS, swatch, tagBg } from "@/lib/meetingMeta"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import type { Tables } from "@/lib/supabase/types"

/**
 * 태스크(체크리스트) 타임라인 — 노션식(세션41 대표 요청).
 * - 항상 오늘 기준: 마운트 시 오늘 위치로 자동 스크롤, 오늘 빨간 세로선 + 주 단위 날짜 눈금(정확한 날짜 축).
 * - 바 드래그=이동 · 양끝=시작/기한 조절 · 클릭=편집 패널(제목·기간·색상 — 사용자가 전부 조정 가능).
 * - 📎 일정별 파일 추가/빼기. 좁은 바는 라벨을 바 오른쪽에 표시(글씨 삐져나옴 방지).
 * 데이터: 마이그123(start_date·files.project_task_id)·124(color).
 */

type ProjectTask = Tables<"project_tasks">
type TaskFile = Pick<Tables<"files">, "id" | "name" | "web_view_link" | "project_task_id">
export type TaskPatch = Partial<Pick<ProjectTask, "title" | "start_date" | "due_date" | "color">>

const PPD = 8 // px per day
const DAY = 86400000
const LABEL_MIN_W = 96 // 이보다 좁은 바는 라벨을 바깥(오른쪽)에

function d0(s: string): number {
  return new Date(`${s}T00:00:00`).getTime()
}
function fmt(t: number): string {
  const d = new Date(t)
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
  onUpdateTask,
}: {
  projectId: string
  tasks: ProjectTask[]
  onUpdateTask: (t: ProjectTask, patch: TaskPatch) => void
}) {
  const supabase = createClient()
  const me = useCurrentUserId()
  const wsId = useCurrentWorkspaceId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [openPanel, setOpenPanel] = useState<{ id: string; tab: "edit" | "files" } | null>(null)
  const [files, setFiles] = useState<TaskFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")

  const dated = tasks.filter((t) => t.due_date)
  const today = todayStr()
  const todayT = d0(today)
  const hasDated = dated.length > 0

  // 축 범위 — 태스크 기간 전체 + 오늘 기준 앞뒤 여백(훅보다 먼저 계산 — 자동 스크롤 effect가 todayX를 쓴다)
  const startsOf = (t: ProjectTask) => d0((t.start_date ?? t.due_date) as string)
  const lo0 = hasDated ? Math.min(...dated.map(startsOf), todayT) - 10 * DAY : todayT
  const hi = hasDated ? Math.max(...dated.map((t) => d0(t.due_date as string)), todayT) + 30 * DAY : todayT
  // lo를 주 시작(월요일)에 스냅 — 주 눈금이 정확한 날짜에 붙게
  const loDate = new Date(lo0)
  loDate.setDate(loDate.getDate() - ((loDate.getDay() + 6) % 7))
  loDate.setHours(0, 0, 0, 0)
  const lo = loDate.getTime()
  const width = Math.ceil((hi - lo) / DAY) * PPD
  const x = (t: number) => ((t - lo) / DAY) * PPD
  const todayX = x(todayT)

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

  // 항상 오늘 기준 — 마운트 시 오늘이 왼쪽 1/4 지점에 오게 스크롤
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !hasDated) return
    el.scrollLeft = Math.max(0, todayX - el.clientWidth / 4)
    // todayX 변화(범위 재계산)마다 오늘 기준 유지 — 사용자가 수동 스크롤한 뒤에는 hasDated 불변이라 재실행 없음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDated])

  // 빈 상태 — 사용법 안내(대표: "들어갔을 때 아무것도 없으니 어떻게 수정할지 모르겠음")
  if (!hasDated) {
    return (
      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
        <CalendarRange className="size-4 shrink-0" />
        <span>
          아래에 할 일을 입력하고 <b className="font-medium text-foreground">기한</b>을 정하면 여기 타임라인에 바로 나타나요. 시작일까지 정하면 기간
          바가 되고, 바를 <b className="font-medium text-foreground">드래그</b>해 일정을 옮기거나 <b className="font-medium text-foreground">클릭</b>해
          이름·기간·색상을 고칠 수 있어요.
        </span>
      </div>
    )
  }

  // 눈금 — 월 경계(굵게) + 매주 월요일(날짜 숫자)
  const months: { x: number; label: string }[] = []
  const weeks: { x: number; label: string }[] = []
  {
    const c = new Date(lo)
    while (c.getTime() <= hi) {
      if (c.getDate() === 1) months.push({ x: x(c.getTime()), label: c.getMonth() === 0 ? `${c.getFullYear()}년 1월` : `${c.getMonth() + 1}월` })
      if (c.getDay() === 1) weeks.push({ x: x(c.getTime()), label: String(c.getDate()) })
      c.setDate(c.getDate() + 1)
    }
    if (months.length === 0 || months[0].x > 40) {
      const first = new Date(lo)
      months.unshift({ x: 2, label: `${first.getMonth() + 1}월` })
    }
  }

  const shiftDate = (s: string, n: number): string => {
    const d = new Date(`${s}T00:00:00`)
    d.setDate(d.getDate() + n)
    return fmt(d.getTime())
  }

  const startDrag = (e: React.PointerEvent, t: ProjectTask, mode: DragState["mode"]) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const onMoveEv = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      setDrag({ id: t.id, mode, startX, dDays: Math.round(dx / PPD), moved: Math.abs(dx) > 8 })
    }
    // 리뷰 F1: 터치 스크롤 등으로 pointercancel이 오면 커밋 없이 정리(리스너 잔류→유령 날짜 이동 방지)
    const onCancel = () => {
      window.removeEventListener("pointermove", onMoveEv)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onCancel)
      setDrag(null)
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointercancel", onCancel)
      window.removeEventListener("pointermove", onMoveEv)
      window.removeEventListener("pointerup", onUp)
      const dDays = Math.round((ev.clientX - startX) / PPD)
      const moved = Math.abs(ev.clientX - startX) > 8
      setDrag(null)
      const s = t.start_date ?? (t.due_date as string)
      const d = t.due_date as string
      if (!moved) {
        // 클릭 = 편집 패널 토글(제목·기간·색상)
        setOpenPanel((p) => (p?.id === t.id && p.tab === "edit" ? null : { id: t.id, tab: "edit" }))
        return
      }
      if (mode === "move") onUpdateTask(t, { start_date: t.start_date ? shiftDate(s, dDays) : null, due_date: shiftDate(d, dDays) })
      else if (mode === "start") {
        const ns = shiftDate(s, dDays)
        onUpdateTask(t, { start_date: d0(ns) > d0(d) ? d : ns })
      } else {
        const nd = shiftDate(d, dDays)
        onUpdateTask(t, { due_date: d0(nd) < d0(s) ? s : nd })
      }
    }
    window.addEventListener("pointermove", onMoveEv)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onCancel)
    setDrag({ id: t.id, mode, startX, dDays: 0, moved: false })
  }

  // ── 일정별 파일 추가/빼기 ──
  const addUpload = async (taskId: string, file: File) => {
    if (!me || !wsId) return
    setUploading(true)
    try {
      const up = await uploadFile(FILES_BUCKET, file, wsId ?? undefined)
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
    // 연결만 해제(파일 보존). files_update RLS가 소유자 한정 — 남의 파일이면 0행 no-op이라 행 수로 확인(리뷰 M3)
    const { data, error } = await supabase.from("files").update({ project_task_id: null }).eq("id", f.id).select("id")
    if (error || !data?.length) {
      toast.error("본인이 올린 파일만 뺄 수 있어요.")
      return
    }
    loadFiles()
  }

  return (
    <div ref={scrollRef} className="mt-3 overflow-x-auto rounded-xl border">
      <div className="relative" style={{ width, minWidth: "100%" }}>
        {/* 주 경계선(연하게) + 월 경계선(진하게) */}
        {weeks.map((w) => (
          <div key={`w${w.x}`} className="absolute inset-y-0 w-px bg-border/40" style={{ left: w.x }} />
        ))}
        {months.map((m) => (
          <div key={`m${m.x}`} className="absolute inset-y-0 w-px bg-border" style={{ left: m.x }} />
        ))}
        <div className="absolute inset-y-0 z-10 w-px bg-rose-400" style={{ left: x(todayT) }} />

        {/* 날짜 헤더 — 월 + 주(월요일) 날짜 숫자 */}
        <div className="relative h-10 border-b bg-muted/20">
          {months.map((m) => (
            <span key={`ml${m.x}`} className="absolute top-1 text-[11px] font-semibold text-foreground" style={{ left: m.x + 5 }}>
              {m.label}
            </span>
          ))}
          {weeks.map((w) => (
            <span key={`wl${w.x}`} className="absolute top-5 text-[10px] text-muted-foreground tabular-nums" style={{ left: w.x + 3 }}>
              {w.label}
            </span>
          ))}
          <span
            className="absolute top-4 z-10 -translate-x-1/2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums"
            style={{ left: x(todayT) }}
            title={`오늘 (${today})`}
          >
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
          const custom = t.color
          const barBg = custom ? tagBg(custom, 26) : undefined
          const barBorder = custom ? swatch(custom) : undefined
          const taskFiles = files.filter((f) => f.project_task_id === t.id)
          const panel = openPanel?.id === t.id ? openPanel : null
          const labelInside = w >= LABEL_MIN_W
          const label = (
            <>
              <span className={cn("truncate font-medium", t.done && "text-muted-foreground line-through")}>{t.title}</span>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenPanel((p) => (p?.id === t.id && p.tab === "files" ? null : { id: t.id, tab: "files" }))
                  setLinkUrl("")
                }}
                className={cn("inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] transition-colors hover:bg-background/80", taskFiles.length > 0 ? "text-foreground" : "text-muted-foreground")}
                title="일정 파일 추가/빼기"
              >
                <Paperclip className="size-3" />
                {taskFiles.length > 0 && <span className="tabular-nums">{taskFiles.length}</span>}
              </button>
            </>
          )
          return (
            <div key={t.id}>
              <div className="relative h-10">
                <div className="absolute top-1 flex items-center gap-1.5" style={{ left }}>
                  <div
                    onPointerDown={(e) => startDrag(e, t, "move")}
                    className={cn(
                      "group relative h-7 shrink-0 touch-none rounded-lg border shadow-sm",
                      isDrag ? "cursor-grabbing" : "cursor-grab",
                      !custom && (t.done ? "border-success/40 bg-success-bg" : overdue ? "border-rose-300 bg-rose-500/10" : "border-info/40 bg-info-bg")
                    )}
                    style={{ width: w, ...(custom ? { backgroundColor: barBg, borderColor: barBorder } : {}) }}
                    title={`${t.title} · ${t.start_date ? `${s} ~ ` : "기한 "}${d} — 드래그=이동 · 양끝=기간 · 클릭=편집`}
                  >
                    <div onPointerDown={(e) => startDrag(e, t, "start")} className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l-lg" title="시작일 조절(끌면 기간 생성)" />
                    <div onPointerDown={(e) => startDrag(e, t, "due")} className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r-lg" title="기한 조절" />
                    {/* 라벨 — 바가 넉넉하면 안(잘림 처리), 좁으면 아예 바깥에(삐져나옴 방지) */}
                    {labelInside && <div className="absolute inset-y-0 left-2 right-1 z-[5] flex items-center gap-1 overflow-hidden whitespace-nowrap text-xs">{label}</div>}
                  </div>
                  {!labelInside && <div className="flex items-center gap-1 whitespace-nowrap text-xs">{label}</div>}
                </div>
              </div>

              {/* 편집 패널 — 클릭 진입(제목·기간·색상 전부 사용자가 조정) */}
              {panel?.tab === "edit" && (
                <div className="border-y bg-muted/20 px-3 py-2">
                  <div className="sticky left-3 flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                    <input
                      defaultValue={t.title}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v && v !== t.title) onUpdateTask(t, { title: v })
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur()
                      }}
                      className="h-7 w-44 rounded-lg border bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                    />
                    <label className="flex items-center gap-1">
                      시작
                      <DateInput className="w-32" value={t.start_date ?? ""} onChange={(v) => onUpdateTask(t, { start_date: v || null })} />
                    </label>
                    <label className="flex items-center gap-1">
                      기한
                      <DateInput className="w-32" value={t.due_date ?? ""} onChange={(v) => v && onUpdateTask(t, { due_date: v })} min={t.start_date ?? undefined} />
                    </label>
                    <span className="flex items-center gap-1">
                      색상
                      {CATEGORY_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => onUpdateTask(t, { color: t.color === c ? null : c })}
                          className={cn("size-4 rounded-full ring-1 ring-border transition-transform hover:scale-110", t.color === c && "ring-2 ring-foreground")}
                          style={{ backgroundColor: swatch(c) }}
                          title={t.color === c ? "기본색으로" : "색 적용"}
                        />
                      ))}
                    </span>
                    <button onClick={() => setOpenPanel(null)} className="rounded px-1.5 py-0.5 hover:text-foreground">
                      닫기
                    </button>
                  </div>
                </div>
              )}

              {/* 파일 패널 — 이 일정에 붙은 파일/링크(추가·빼기) */}
              {panel?.tab === "files" && (
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
