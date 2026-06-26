"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Plus, X, Check, Trash2, CalendarDays, Pencil, Paperclip, Download, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useUndo } from "@/components/undo/UndoProvider"
import { Loading, ErrorState } from "@/components/shared/States"
import { uploadFile } from "@/lib/upload"
import { formatBytes } from "@/lib/files"
import type { CalendarEvent } from "@/types"
import type { Json } from "@/lib/supabase/types"
import {
  WEEKDAYS_KO,
  addMonths,
  buildMonthGrid,
  combineDateTimeToIso,
  isSameDay,
  monthLabel,
  monthQueryRange,
  toDateInputValue,
} from "@/lib/calendar"

const COLORS = [
  { label: "파랑", value: "#3B82F6" },
  { label: "하늘", value: "#0EA5E9" },
  { label: "청록", value: "#14B8A6" },
  { label: "초록", value: "#10B981" },
  { label: "라임", value: "#84CC16" },
  { label: "노랑", value: "#EAB308" },
  { label: "주황", value: "#F59E0B" },
  { label: "빨강", value: "#EF4444" },
  { label: "분홍", value: "#EC4899" },
  { label: "보라", value: "#8B5CF6" },
  { label: "남색", value: "#6366F1" },
  { label: "회색", value: "#64748B" },
]

const CALENDAR_BUCKET = "calendar-files"

/** 일정 첨부 메타(실파일은 Storage calendar-files, jsonb엔 메타만 보관). */
type CalendarAttachment = { path: string; name: string; mime_type: string; size: number }

/** event.attachments(Json) → 안전 파싱(형식 안 맞는 원소는 버림). */
function parseAttachments(raw: Json | null | undefined): CalendarAttachment[] {
  if (!Array.isArray(raw)) return []
  const out: CalendarAttachment[] = []
  for (const it of raw) {
    if (it && typeof it === "object" && !Array.isArray(it)) {
      const o = it as Record<string, unknown>
      if (typeof o.path === "string" && typeof o.name === "string") {
        out.push({
          path: o.path,
          name: o.name,
          mime_type: typeof o.mime_type === "string" ? o.mime_type : "application/octet-stream",
          size: typeof o.size === "number" ? o.size : 0,
        })
      }
    }
  }
  return out
}

export function CalendarView() {
  const supabase = createClient()
  const [viewDate, setViewDate] = useState(() => new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  // 일정 편집: 상세 모달에서 "수정" → 같은 폼을 편집 모드로 재사용
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null)
  // 기간 일정 생성: {start, end} (단일 클릭이면 start === end)
  const [createRange, setCreateRange] = useState<{ start: Date; end: Date } | null>(null)
  const [highlightDate, setHighlightDate] = useState<Date | null>(null)
  // 드래그 선택 상태 (마우스 다운~업 사이 hover 범위)
  const [dragStart, setDragStart] = useState<Date | null>(null)
  const [dragEnd, setDragEnd] = useState<Date | null>(null)
  const dragging = dragStart !== null

  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const cells = buildMonthGrid(viewDate)

  // 어제/오늘/내일 클릭 시 해당 월로 이동 + 셀 잠시 강조
  const jumpTo = (d: Date) => {
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1))
    setHighlightDate(d)
  }
  useEffect(() => {
    if (!highlightDate) return
    const t = setTimeout(() => setHighlightDate(null), 2500)
    return () => clearTimeout(t)
  }, [highlightDate])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    const { startIso, endIso } = monthQueryRange(viewDate)
    // 가시 범위 [startIso, endIso)와 겹치는 모든 이벤트를 가져온다.
    // - 시작이 범위 끝 이후면 제외(.lt)
    // - 범위에 걸치려면: 종료가 범위 시작 이후거나(멀티데이가 안쪽으로 이어짐),
    //   종료가 없고 시작이 범위 시작 이후(단일일 이벤트)
    try {
      const { data, error: qErr } = await supabase
        .from("calendar_events")
        .select("*")
        .lt("start_time", endIso)
        .or(`end_time.gte.${startIso},and(end_time.is.null,start_time.gte.${startIso})`)
        .order("start_time", { ascending: true })
      if (qErr) throw new Error(qErr.message)
      setEvents(data ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "일정을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [supabase, viewDate])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // 날짜(시:분 무시) 비교용 epoch
  const dayMs = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

  // 멀티데이 이벤트는 시작~종료 사이 모든 날에 표시 (가로 막대 효과)
  const eventsOn = (day: Date) =>
    events.filter((e) => {
      const s = new Date(e.start_time)
      const end = e.end_time ? new Date(e.end_time) : s
      return dayMs(day) >= dayMs(s) && dayMs(day) <= dayMs(end)
    })

  // 셀에 보이는 막대 레인(행) 개수 — 초과분은 "+N개"로 표시
  const LANE_CAP = 3

  // 각 이벤트에 '레인(행) 인덱스'를 고정 배정한다.
  // 같은 이벤트는 자신이 걸친 모든 날에서 동일한 행에 그려져 가로 막대가 끊기지 않고 이어진다.
  // 알고리즘: 시작일 오름차순 → 기간 길이 내림차순으로 정렬한 뒤,
  // 이미 배치된 이벤트 중 날짜 범위가 겹치는 것이 차지한 레인을 피해 가장 낮은 빈 레인을 그리디로 부여.
  const laneByEventId = useMemo(() => {
    // 이벤트의 [시작일, 종료일] epoch(시:분 무시)
    const rangeOf = (e: CalendarEvent): { start: number; end: number } => {
      const s = new Date(e.start_time)
      const end = e.end_time ? new Date(e.end_time) : s
      const startMs = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime()
      const endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
      return { start: startMs, end: Math.max(startMs, endMs) }
    }
    const sorted = [...events].sort((a, b) => {
      const ra = rangeOf(a)
      const rb = rangeOf(b)
      if (ra.start !== rb.start) return ra.start - rb.start
      const durA = ra.end - ra.start
      const durB = rb.end - rb.start
      if (durA !== durB) return durB - durA // 긴 일정 먼저 (낮은 레인 선점)
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0 // 안정적 tie-break
    })
    const placed: { start: number; end: number; lane: number }[] = []
    const map = new Map<string, number>()
    for (const e of sorted) {
      const r = rangeOf(e)
      // 이 이벤트와 날짜 범위가 겹치는, 이미 배치된 이벤트들의 레인 집합
      const taken = new Set<number>()
      for (const p of placed) {
        if (r.start <= p.end && r.end >= p.start) taken.add(p.lane)
      }
      let lane = 0
      while (taken.has(lane)) lane++
      map.set(e.id, lane)
      placed.push({ start: r.start, end: r.end, lane })
    }
    return map
  }, [events])

  // 드래그 선택 범위(정렬된) 안에 day가 포함되는지
  const inDragRange = (day: Date) => {
    if (!dragStart || !dragEnd) return false
    const lo = Math.min(dayMs(dragStart), dayMs(dragEnd))
    const hi = Math.max(dayMs(dragStart), dayMs(dragEnd))
    return dayMs(day) >= lo && dayMs(day) <= hi
  }

  // 마우스 업(그리드 밖 포함)에서 드래그 종료 → 생성 모달 오픈
  useEffect(() => {
    if (!dragging) return
    const onUp = () => {
      if (dragStart) {
        const e = dragEnd ?? dragStart
        const [start, end] = dayMs(dragStart) <= dayMs(e) ? [dragStart, e] : [e, dragStart]
        setCreateRange({ start, end })
      }
      setDragStart(null)
      setDragEnd(null)
    }
    // 드래그 중 창이 포커스를 잃거나(alt-tab) Esc를 누르면 mouseup이 안 올 수 있다.
    // 이 경우 모달을 열지 않고 드래그만 취소 → 이후 hover가 범위를 늘리는 버그 방지.
    const onCancel = () => {
      setDragStart(null)
      setDragEnd(null)
    }
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onCancel()
    }
    window.addEventListener("mouseup", onUp)
    window.addEventListener("blur", onCancel)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("mouseup", onUp)
      window.removeEventListener("blur", onCancel)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [dragging, dragStart, dragEnd])

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => setViewDate(addMonths(viewDate, -1))}>
            <ChevronLeft />
          </Button>
          <span className="min-w-32 text-center text-lg font-semibold">{monthLabel(viewDate)}</span>
          <Button variant="outline" size="icon-sm" onClick={() => setViewDate(addMonths(viewDate, 1))}>
            <ChevronRight />
          </Button>
          <div className="ml-1 inline-flex overflow-hidden rounded-md border bg-card text-xs">
            <button
              type="button"
              onClick={() => jumpTo(yesterday)}
              className="px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              어제
            </button>
            <button
              type="button"
              onClick={() => jumpTo(today)}
              className="border-x px-2.5 py-1 font-medium transition-colors hover:bg-muted"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => jumpTo(tomorrow)}
              className="px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              내일
            </button>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreateRange({ start: new Date(), end: new Date() })}>
          <Plus /> 일정 추가
        </Button>
      </div>

      {/* 요일 행 */}
      <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
        {WEEKDAYS_KO.map((w, i) => (
          <div key={w} className={cn("py-2", i === 0 && "text-destructive", i === 6 && "text-info")}>
            {w}
          </div>
        ))}
      </div>

      {/* 월간 그리드 — 셀을 드래그하면 기간 일정 생성 */}
      <div className="grid flex-1 select-none grid-cols-7 grid-rows-6 gap-px overflow-hidden rounded-lg border bg-border">
        {cells.map((day, i) => {
          const inMonth = day.getMonth() === viewDate.getMonth()
          const isToday = isSameDay(day, today)
          const isHighlighted = highlightDate ? isSameDay(day, highlightDate) : false
          const isDragged = inDragRange(day)
          const dayEvents = eventsOn(day)
          return (
            <button
              key={i}
              type="button"
              onMouseDown={() => {
                setDragStart(day)
                setDragEnd(day)
              }}
              onMouseEnter={() => {
                if (dragging) setDragEnd(day)
              }}
              className={cn(
                "flex min-h-0 flex-col gap-1 bg-card p-1.5 text-left transition-colors duration-150 ease-out hover:bg-muted/50",
                !inMonth && "bg-muted/30 text-muted-foreground",
                isDragged && "bg-primary/15 hover:bg-primary/15",
                isHighlighted && "bg-primary/5 ring-2 ring-inset ring-primary"
              )}
            >
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full text-xs",
                  isToday && "bg-primary font-semibold text-primary-foreground"
                )}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {/* 레인(행) 단위 렌더 — 같은 이벤트가 매 칸 동일 행에 놓여 가로 막대가 끊김 없이 이어진다.
                    레인 0..LANE_CAP-1 만 표시하고, 빈 레인은 같은 높이의 spacer로 채워 칸끼리 행을 정렬한다. */}
                {Array.from({ length: LANE_CAP }, (_, lane) => {
                  const e = dayEvents.find((ev) => laneByEventId.get(ev.id) === lane)
                  if (!e) {
                    // 빈 레인 — 막대와 동일 높이(py-0.5 + text-[11px]/leading)의 자리 표시
                    return (
                      <span key={`spacer-${lane}`} className="py-0.5 text-[11px] leading-[1.2]">
                        {" "}
                      </span>
                    )
                  }
                  const es = new Date(e.start_time)
                  const ee = e.end_time ? new Date(e.end_time) : es
                  const dow = day.getDay()
                  const isStart = isSameDay(day, es)
                  const isEnd = isSameDay(day, ee)
                  // 막대를 칸 사이까지 늘려 이어지게: 시작/주 시작에만 왼쪽 둥글게, 끝/주 끝에만 오른쪽 둥글게.
                  const roundLeft = isStart || dow === 0
                  const roundRight = isEnd || dow === 6
                  const showLabel = isStart || dow === 0 // 라벨은 막대 시작·각 주 시작에만
                  return (
                    <span
                      key={e.id}
                      onMouseDown={(ev) => ev.stopPropagation()}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setSelected(e)
                      }}
                      className={cn(
                        "relative truncate py-0.5 text-[11px] leading-[1.2] text-white",
                        roundLeft ? "rounded-l" : "rounded-l-none",
                        roundRight ? "rounded-r" : "rounded-r-none",
                        showLabel ? "pl-1.5 pr-1" : "px-1",
                        e.status === "done" && "line-through opacity-60"
                      )}
                      style={{
                        backgroundColor: e.color,
                        // 연결되는 쪽은 칸 패딩(6px)+그리드 간격(1px)을 음수 마진으로 메움
                        marginLeft: roundLeft ? undefined : "-7px",
                        marginRight: roundRight ? undefined : "-7px",
                      }}
                    >
                      {showLabel ? e.title : " "}
                    </span>
                  )
                })}
                {/* 초과분은 레인 기준으로 계산 — 레인 < LANE_CAP 인 이벤트는 자신이 걸친 모든 날에
                    빠짐없이 보이므로 가로 막대 중간에 구멍이 생기지 않는다. */}
                {(() => {
                  const overflow = dayEvents.filter((ev) => (laneByEventId.get(ev.id) ?? 0) >= LANE_CAP).length
                  return overflow > 0 ? (
                    <span className="px-1 text-[10px] text-muted-foreground">+{overflow}개</span>
                  ) : null
                })()}
              </div>
            </button>
          )
        })}
      </div>

      {loading && <Loading rows={3} />}

      {error && !loading && (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null)
            loadEvents()
          }}
        />
      )}

      {createRange && (
        <CreateEventModal
          start={createRange.start}
          end={createRange.end}
          reload={loadEvents}
          onClose={() => setCreateRange(null)}
          onCreated={() => {
            setCreateRange(null)
            loadEvents()
          }}
        />
      )}

      {selected && (
        <EventDetailModal
          event={selected}
          reload={loadEvents}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null)
            loadEvents()
          }}
          onEdit={() => {
            setEditEvent(selected)
            setSelected(null)
          }}
        />
      )}

      {editEvent && (
        <CreateEventModal
          event={editEvent}
          reload={loadEvents}
          onClose={() => setEditEvent(null)}
          onCreated={() => {
            setEditEvent(null)
            loadEvents()
          }}
        />
      )}
    </div>
  )
}

/** 공통 모달 셸 */
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border bg-card p-5 shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

function CreateEventModal({
  start,
  end,
  event,
  reload,
  onClose,
  onCreated,
}: {
  start?: Date
  end?: Date
  event?: CalendarEvent
  reload: () => void
  onClose: () => void
  onCreated: () => void
}) {
  const supabase = createClient()
  const me = useCurrentUserId()
  const { push } = useUndo()
  const isEdit = !!event
  const [title, setTitle] = useState(event?.title ?? "")
  const [description, setDescription] = useState(event?.description ?? "")
  const [startDateStr, setStartDateStr] = useState(
    event ? toDateInputValue(new Date(event.start_time)) : toDateInputValue(start ?? new Date())
  )
  const [endDateStr, setEndDateStr] = useState(
    event ? toDateInputValue(new Date(event.end_time ?? event.start_time)) : toDateInputValue(end ?? start ?? new Date())
  )
  const [color, setColor] = useState(event?.color ?? COLORS[0].value)
  const [attachments, setAttachments] = useState<CalendarAttachment[]>(
    event ? parseAttachments(event.attachments) : []
  )
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const multiDay = startDateStr !== endDateStr

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const uploaded = await Promise.all(
        Array.from(files).map(async (f) => {
          const up = await uploadFile(CALENDAR_BUCKET, f)
          return { path: up.path, name: up.name, mime_type: up.mimeType, size: up.size }
        })
      )
      setAttachments((prev) => [...prev, ...uploaded])
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일 업로드에 실패했습니다.")
    } finally {
      setUploading(false)
    }
  }
  const removeAttachment = (path: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== path))
  }

  const inputCls =
    "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
  const dateCls = cn(inputCls, "accent-primary [color-scheme:light] dark:[color-scheme:dark]")

  // YYYY-MM-DD → "2026년 5월 12일"
  const fmtKo = (s: string) => {
    const [y, m, d] = s.split("-").map(Number)
    return y ? `${y}년 ${m}월 ${d}일` : ""
  }
  const dayCount = (() => {
    const [y1, m1, d1] = startDateStr.split("-").map(Number)
    const [y2, m2, d2] = endDateStr.split("-").map(Number)
    if (!y1 || !y2) return 1
    const a = new Date(y1, m1 - 1, d1).getTime()
    const b = new Date(y2, m2 - 1, d2).getTime()
    return Math.max(1, Math.round((b - a) / 86400000) + 1)
  })()

  const submit = async () => {
    if (!title.trim()) {
      setError("제목을 입력해 주세요.")
      return
    }
    if (endDateStr < startDateStr) {
      setError("종료일이 시작일보다 빠릅니다.")
      return
    }
    setSaving(true)
    setError(null)
    if (!me) {
      setError("로그인이 필요합니다.")
      setSaving(false)
      return
    }
    // 날짜만(종일) — 멀티데이면 종료일 23:59까지, 단일일이면 종료 없음
    const endIso = multiDay ? combineDateTimeToIso(endDateStr, "23:59") : null
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      start_time: combineDateTimeToIso(startDateStr, "00:00"),
      end_time: endIso,
      all_day: true,
      color,
      attachments: attachments as unknown as Json,
    }
    // 편집 모드 — 업데이트(+Undo)
    if (isEdit && event) {
      const prev = {
        title: event.title,
        description: event.description,
        start_time: event.start_time,
        end_time: event.end_time,
        all_day: event.all_day,
        color: event.color,
        attachments: event.attachments,
      }
      const { data: updated, error: uErr } = await supabase
        .from("calendar_events")
        .update(payload)
        .eq("id", event.id)
        .select("id")
      setSaving(false)
      if (uErr) {
        setError(uErr.message)
        return
      }
      // RLS 등으로 0행이면 에러 없이 안 바뀐다 → 과거 '조용한 실패'의 원인. 명확히 알린다.
      if (!updated || updated.length === 0) {
        setError("수정에 실패했어요. 권한이 없거나 일정이 삭제된 것 같아요.")
        return
      }
      push({
        label: "일정 수정",
        undo: async () => {
          await supabase.from("calendar_events").update(prev).eq("id", event.id)
          reload()
        },
        redo: async () => {
          await supabase.from("calendar_events").update(payload).eq("id", event.id)
          reload()
        },
      })
      onCreated()
      return
    }
    const { data: inserted, error: insErr } = await supabase
      .from("calendar_events")
      .insert({ ...payload, created_by: me })
      .select()
      .single()
    setSaving(false)
    if (insErr) {
      setError(insErr.message)
      return
    }
    if (inserted) {
      push({
        label: "일정 추가",
        undo: async () => {
          await supabase.from("calendar_events").delete().eq("id", inserted.id)
          reload()
        },
        redo: async () => {
          await supabase.from("calendar_events").insert(inserted)
          reload()
        },
      })
    }
    onCreated()
  }

  return (
    <ModalShell title={isEdit ? "일정 수정" : multiDay ? "기간 일정 추가" : "일정 추가"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input className={inputCls} placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <textarea
          className={cn(inputCls, "h-16 resize-none py-2")}
          placeholder="설명 (선택)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {/* 기간 — 한국어 요약을 강조하고 입력기는 보조로 */}
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="mb-2.5 flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-primary" />
            <span className="text-sm font-medium">
              {multiDay ? `${fmtKo(startDateStr)} → ${fmtKo(endDateStr)}` : fmtKo(startDateStr)}
            </span>
            {multiDay && (
              <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {dayCount}일간
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">
              <span className="mb-1 block">시작일</span>
              <input type="date" className={dateCls} value={startDateStr} onChange={(e) => setStartDateStr(e.target.value)} />
            </label>
            <label className="text-xs text-muted-foreground">
              <span className="mb-1 block">종료일</span>
              <input type="date" className={dateCls} value={endDateStr} min={startDateStr} onChange={(e) => setEndDateStr(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">색상</span>
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className={cn("size-6 rounded-full ring-offset-2 transition-transform hover:scale-110", color === c.value && "ring-2 ring-ring")}
              style={{ backgroundColor: c.value }}
              aria-label={c.label}
            />
          ))}
        </div>
        {/* 첨부파일 — 업로드 후 메타만 jsonb에 저장(실파일은 calendar-files 버킷) */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">첨부파일</span>
            <label
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent",
                uploading && "pointer-events-none opacity-60"
              )}
            >
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
              파일 추가
              <input
                type="file"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ""
                }}
              />
            </label>
          </div>
          {attachments.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {attachments.map((a) => (
                <li
                  key={a.path}
                  className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5 text-sm"
                >
                  <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(a.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.path)}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    aria-label="첨부 제거"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button size="sm" onClick={submit} disabled={saving || uploading}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}

function EventDetailModal({
  event,
  reload,
  onClose,
  onChanged,
  onEdit,
}: {
  event: CalendarEvent
  reload: () => void
  onClose: () => void
  onChanged: () => void
  onEdit: () => void
}) {
  const supabase = createClient()
  const { push } = useUndo()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const start = new Date(event.start_time)
  const end = event.end_time ? new Date(event.end_time) : null
  const multiDay = end ? !isSameDay(start, end) : false
  const attachments = parseAttachments(event.attachments)

  const download = async (path: string) => {
    const { data } = await supabase.storage.from(CALENDAR_BUCKET).createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, "_blank")
  }

  const toggleDone = async () => {
    const prev = event.status
    const next = event.status === "done" ? "scheduled" : "done"
    setBusy(true)
    setErr(null)
    const { data, error } = await supabase
      .from("calendar_events")
      .update({ status: next })
      .eq("id", event.id)
      .select("id")
    setBusy(false)
    if (error || !data || data.length === 0) {
      setErr("처리에 실패했어요. 잠시 후 다시 시도해 주세요.")
      return
    }
    push({
      label: next === "done" ? "일정 완료" : "완료 취소",
      undo: async () => {
        await supabase.from("calendar_events").update({ status: prev }).eq("id", event.id)
        reload()
      },
      redo: async () => {
        await supabase.from("calendar_events").update({ status: next }).eq("id", event.id)
        reload()
      },
    })
    onChanged()
  }

  const remove = async () => {
    setBusy(true)
    setErr(null)
    const { data, error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", event.id)
      .select("id")
    setBusy(false)
    if (error || !data || data.length === 0) {
      setErr("삭제에 실패했어요. 잠시 후 다시 시도해 주세요.")
      return
    }
    push({
      label: "일정 삭제",
      undo: async () => {
        await supabase.from("calendar_events").insert(event)
        reload()
      },
      redo: async () => {
        await supabase.from("calendar_events").delete().eq("id", event.id)
        reload()
      },
    })
    onChanged()
  }

  return (
    <ModalShell title={event.title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="size-3 rounded-full" style={{ backgroundColor: event.color }} />
          <span>
            {multiDay && end
              ? `${start.toLocaleDateString("ko-KR", { dateStyle: "long" })} ~ ${end.toLocaleDateString("ko-KR", { dateStyle: "long" })}`
              : start.toLocaleDateString("ko-KR", { dateStyle: "long" })}
          </span>
        </div>
        {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
        {attachments.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {attachments.map((a) => (
              <li
                key={a.path}
                className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5 text-sm"
              >
                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(a.size)}</span>
                <button
                  type="button"
                  onClick={() => download(a.path)}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                  aria-label="다운로드"
                >
                  <Download className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {event.status === "done" && <p className="text-sm font-medium text-success">✓ 완료된 일정</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex items-center justify-between gap-2">
          <Button variant="destructive" size="sm" onClick={remove} disabled={busy}>
            <Trash2 /> 삭제
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
              <Pencil /> 수정
            </Button>
            <Button size="sm" onClick={toggleDone} disabled={busy}>
              <Check /> {event.status === "done" ? "완료 취소" : "완료 처리"}
            </Button>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}
