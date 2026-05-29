"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Plus, X, Check, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { CalendarEvent } from "@/types"
import {
  WEEKDAYS_KO,
  addMonths,
  buildMonthGrid,
  combineDateTimeToIso,
  isSameDay,
  monthLabel,
  monthQueryRange,
  toDateInputValue,
  toTimeInputValue,
} from "@/lib/calendar"

const COLORS = [
  { label: "파랑", value: "#3B82F6" },
  { label: "초록", value: "#10B981" },
  { label: "주황", value: "#F59E0B" },
  { label: "빨강", value: "#EF4444" },
  { label: "보라", value: "#8B5CF6" },
  { label: "분홍", value: "#EC4899" },
]

export function CalendarView() {
  const supabase = createClient()
  const [viewDate, setViewDate] = useState(() => new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [createDate, setCreateDate] = useState<Date | null>(null)
  const [highlightDate, setHighlightDate] = useState<Date | null>(null)

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
    const { data } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("start_time", startIso)
      .lt("start_time", endIso)
      .order("start_time", { ascending: true })
    setEvents(data ?? [])
    setLoading(false)
  }, [supabase, viewDate])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const eventsOn = (day: Date) =>
    events.filter((e) => isSameDay(new Date(e.start_time), day))

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
          <div className="ml-1 inline-flex overflow-hidden rounded-md border bg-background text-xs">
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
        <Button size="sm" onClick={() => setCreateDate(new Date())}>
          <Plus /> 일정 추가
        </Button>
      </div>

      {/* 요일 행 */}
      <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
        {WEEKDAYS_KO.map((w, i) => (
          <div key={w} className={cn("py-2", i === 0 && "text-red-500", i === 6 && "text-blue-500")}>
            {w}
          </div>
        ))}
      </div>

      {/* 월간 그리드 */}
      <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-px overflow-hidden rounded-lg border bg-border">
        {cells.map((day, i) => {
          const inMonth = day.getMonth() === viewDate.getMonth()
          const isToday = isSameDay(day, today)
          const isHighlighted = highlightDate ? isSameDay(day, highlightDate) : false
          const dayEvents = eventsOn(day)
          return (
            <button
              key={i}
              type="button"
              onClick={() => setCreateDate(day)}
              className={cn(
                "flex min-h-0 flex-col gap-1 bg-background p-1.5 text-left transition-colors hover:bg-muted/50",
                !inMonth && "bg-muted/30 text-muted-foreground",
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
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((e) => (
                  <span
                    key={e.id}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setSelected(e)
                    }}
                    className={cn(
                      "truncate rounded px-1 py-0.5 text-[11px] text-white",
                      e.status === "done" && "line-through opacity-60"
                    )}
                    style={{ backgroundColor: e.color }}
                  >
                    {e.title}
                  </span>
                ))}
                {dayEvents.length > 3 && (
                  <span className="px-1 text-[10px] text-muted-foreground">+{dayEvents.length - 3}개</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {loading && <p className="text-center text-sm text-muted-foreground">불러오는 중…</p>}

      {createDate && (
        <CreateEventModal
          date={createDate}
          onClose={() => setCreateDate(null)}
          onCreated={() => {
            setCreateDate(null)
            loadEvents()
          }}
        />
      )}

      {selected && (
        <EventDetailModal
          event={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null)
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
        className="w-full max-w-md rounded-xl border bg-background p-5 shadow-lg"
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
  date,
  onClose,
  onCreated,
}: {
  date: Date
  onClose: () => void
  onCreated: () => void
}) {
  const supabase = createClient()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [dateStr, setDateStr] = useState(toDateInputValue(date))
  const [startTime, setStartTime] = useState(toTimeInputValue(date))
  const [endTime, setEndTime] = useState("")
  const [color, setColor] = useState(COLORS[0].value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputCls =
    "h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

  const submit = async () => {
    if (!title.trim()) {
      setError("제목을 입력해 주세요.")
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
    const { error: insErr } = await supabase.from("calendar_events").insert({
      title: title.trim(),
      description: description.trim() || null,
      start_time: combineDateTimeToIso(dateStr, startTime),
      end_time: endTime ? combineDateTimeToIso(dateStr, endTime) : null,
      color,
      created_by: auth.user.id,
    })
    setSaving(false)
    if (insErr) {
      setError(insErr.message)
      return
    }
    onCreated()
  }

  return (
    <ModalShell title="일정 추가" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input className={inputCls} placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <textarea
          className={cn(inputCls, "h-16 resize-none py-2")}
          placeholder="설명 (선택)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            날짜
            <input type="date" className={inputCls} value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground">
            시작
            <input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground">
            종료
            <input type="time" className={inputCls} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">색상</span>
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className={cn("size-5 rounded-full ring-offset-2", color === c.value && "ring-2 ring-ring")}
              style={{ backgroundColor: c.value }}
              aria-label={c.label}
            />
          ))}
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
    </ModalShell>
  )
}

function EventDetailModal({
  event,
  onClose,
  onChanged,
}: {
  event: CalendarEvent
  onClose: () => void
  onChanged: () => void
}) {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const start = new Date(event.start_time)

  const toggleDone = async () => {
    setBusy(true)
    await supabase
      .from("calendar_events")
      .update({ status: event.status === "done" ? "scheduled" : "done" })
      .eq("id", event.id)
    setBusy(false)
    onChanged()
  }

  const remove = async () => {
    setBusy(true)
    await supabase.from("calendar_events").delete().eq("id", event.id)
    setBusy(false)
    onChanged()
  }

  return (
    <ModalShell title={event.title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="size-3 rounded-full" style={{ backgroundColor: event.color }} />
          <span>
            {start.toLocaleString("ko-KR", { dateStyle: "long", timeStyle: "short" })}
          </span>
        </div>
        {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
        {event.status === "done" && <p className="text-sm font-medium text-green-600">✓ 완료된 일정</p>}
        <div className="flex justify-between gap-2">
          <Button variant="destructive" size="sm" onClick={remove} disabled={busy}>
            <Trash2 /> 삭제
          </Button>
          <Button size="sm" onClick={toggleDone} disabled={busy}>
            <Check /> {event.status === "done" ? "완료 취소" : "완료 처리"}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
