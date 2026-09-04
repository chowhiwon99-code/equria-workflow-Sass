"use client"

// 회의록 상단 — MeetingEditor 분해(P0). 상단 바(뒤로/PDF/삭제/저장) + 제목 + 메타(날짜·참석자) +
// "보는 중" 표시(편집 충돌 완화). P3에서 프로젝트/일정 연결 셀렉트가 여기에 추가된다.
import { useEffect, useRef } from "react"
import { ArrowLeft, Trash2, Loader2, Calendar, Users, Eye, FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"

export function MeetingHeader({
  canEdit,
  busy,
  hasNote,
  authorName,
  authorPosition,
  viewerNames,
  title,
  onTitleChange,
  meetingDate,
  onMeetingDateChange,
  attendees,
  onAttendeesChange,
  onBack,
  onSave,
  onRemove,
  onExportPdf,
}: {
  canEdit: boolean
  busy: boolean
  hasNote: boolean
  authorName?: string
  authorPosition?: string | null
  viewerNames: string[]
  title: string
  onTitleChange: (v: string) => void
  meetingDate: string
  onMeetingDateChange: (v: string) => void
  attendees: string
  onAttendeesChange: (v: string) => void
  onBack: () => void
  onSave: () => void
  onRemove: () => void
  onExportPdf: () => void
}) {
  const titleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const t = titleRef.current
    if (t) {
      t.style.height = "auto"
      t.style.height = `${t.scrollHeight}px`
    }
  }, [])

  const sizeTitle = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    t.style.height = "auto"
    t.style.height = `${t.scrollHeight}px`
  }

  return (
    <>
      {/* 상단 바 */}
      <div className="mb-6 flex items-center justify-between gap-2">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> 목록
        </button>
        <div className="flex items-center gap-1.5">
          {viewerNames.length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              title={`${viewerNames.join(", ")} 님이 이 회의록을 보고 있어요`}
            >
              <Eye className="size-3" /> {viewerNames.length === 1 ? viewerNames[0] : `${viewerNames[0]} 외 ${viewerNames.length - 1}명`} 보는 중
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={onExportPdf} title="PDF로 저장 (인쇄 → 대상을 'PDF로 저장')">
            <FileDown className="size-3.5" /> PDF
          </Button>
          {canEdit ? (
            <>
              {hasNote && (
                <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy} className="text-destructive hover:text-destructive">
                  <Trash2 className="size-3.5" /> 삭제
                </Button>
              )}
              <Button size="sm" onClick={onSave} disabled={busy}>
                {busy && <Loader2 className="size-3.5 animate-spin" />} 저장
              </Button>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              읽기 전용{authorName ? ` · ${[authorName, authorPosition].filter(Boolean).join(" · ")}` : ""}
            </span>
          )}
        </div>
      </div>

      {/* 제목 — 보더 없는 큰 텍스트 */}
      {canEdit ? (
        <textarea
          ref={titleRef}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onInput={sizeTitle}
          rows={1}
          placeholder="제목 없음"
          className="w-full resize-none border-0 bg-transparent p-0 text-3xl font-bold leading-tight outline-none placeholder:text-muted-foreground/40 focus-visible:ring-0"
        />
      ) : (
        <h1 className="text-3xl font-bold leading-tight">{title || "제목 없음"}</h1>
      )}

      {/* 메타 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        {canEdit ? (
          <>
            <label className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => onMeetingDateChange(e.target.value)}
                className="border-0 bg-transparent p-0 text-xs text-foreground outline-none focus-visible:ring-0"
              />
            </label>
            <label className="inline-flex min-w-0 flex-1 items-center gap-1.5">
              <Users className="size-3.5 shrink-0" />
              <input
                value={attendees}
                onChange={(e) => onAttendeesChange(e.target.value)}
                placeholder="참석자 추가"
                className="w-full border-0 bg-transparent p-0 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
              />
            </label>
          </>
        ) : (
          <>
            {meetingDate && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5" /> {meetingDate}
              </span>
            )}
            {attendees && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" /> {attendees}
              </span>
            )}
          </>
        )}
      </div>
    </>
  )
}
