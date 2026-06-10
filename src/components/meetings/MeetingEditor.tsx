"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ArrowLeft, Paperclip, Download, Trash2, X, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { uploadFile } from "@/lib/upload"
import { FILES_BUCKET } from "@/lib/files"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { MeetingAiAssist } from "./MeetingAiAssist"
import type { Tables } from "@/lib/supabase/types"

type Note = Tables<"meeting_notes">
const MAX_BYTES = 20 * 1024 * 1024 // 20MB

function fmtBytes(n: number | null): string {
  if (!n) return ""
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

export function MeetingEditor({
  note,
  me,
  isAdmin,
  authorName,
  onBack,
  onSaved,
  onDeleted,
}: {
  note: Note | null
  me: string
  isAdmin: boolean
  authorName?: string
  onBack: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const supabase = createClient()
  const canEdit = !note || note.user_id === me || isAdmin

  // 에디터 진입 시점의 초기값(변경 감지 기준) — 첫 마운트에 한 번 고정.
  const init = useMemo(
    () => ({
      title: note?.title ?? "",
      meetingDate: note?.meeting_date ?? new Date().toLocaleDateString("en-CA"),
      attendees: note?.attendees ?? "",
      content: note?.content ?? "",
      path: note?.attachment_path ?? null,
    }),
    [note]
  )

  const [title, setTitle] = useState(init.title)
  const [meetingDate, setMeetingDate] = useState(init.meetingDate)
  const [attendees, setAttendees] = useState(init.attendees)
  const [content, setContent] = useState(init.content)
  const [att, setAtt] = useState<{ path: string | null; name: string | null; size: number | null }>({
    path: note?.attachment_path ?? null,
    name: note?.attachment_name ?? null,
    size: note?.attachment_size ?? null,
  })
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 저장된 첨부(서버 라우트로 열람 가능)인지 — 새로 올린 미저장 첨부는 저장 후 열람
  const savedAttachment = !!note?.id && att.path === note.attachment_path && !!att.path

  // 저장하지 않은 변경 여부 — 이탈 경고에 사용.
  const dirty =
    canEdit &&
    (title !== init.title ||
      meetingDate !== init.meetingDate ||
      attendees !== init.attendees ||
      content !== init.content ||
      att.path !== init.path)

  // 변경이 있을 때 브라우저 새로고침/닫기 경고(앱 내 이탈은 handleBack이 막는다).
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", h)
    return () => window.removeEventListener("beforeunload", h)
  }, [dirty])

  const handleBack = () => {
    if (dirty && !confirm("저장하지 않은 변경이 있어요. 목록으로 나갈까요?")) return
    onBack()
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (file.size > MAX_BYTES) {
      toast.error("20MB 이하 파일만 첨부할 수 있어요.")
      return
    }
    setUploading(true)
    try {
      const up = await uploadFile(FILES_BUCKET, file)
      setAtt({ path: up.path, name: up.name, size: up.size })
      toast.success("파일을 첨부했어요. 저장하면 공유됩니다.")
    } catch {
      toast.error("업로드에 실패했어요.")
    } finally {
      setUploading(false)
    }
  }

  const openAttachment = async () => {
    if (!note?.id) return
    try {
      const res = await fetch("/api/meeting-notes/attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: note.id }),
      })
      if (!res.ok) throw new Error()
      const { url } = (await res.json()) as { url: string }
      window.open(url, "_blank")
    } catch {
      toast.error("첨부를 열 수 없어요.")
    }
  }

  const save = async () => {
    if (!title.trim()) {
      toast.error("제목을 입력해 주세요.")
      return
    }
    setBusy(true)
    try {
      const payload = {
        title: title.trim(),
        content,
        meeting_date: meetingDate || null,
        attendees: attendees.trim() || null,
        attachment_path: att.path,
        attachment_name: att.name,
        attachment_size: att.size,
      }
      if (note?.id) {
        await mustOk(
          supabase
            .from("meeting_notes")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", note.id)
        )
        toast.success("회의록을 저장했어요.")
      } else {
        await mustOk(supabase.from("meeting_notes").insert({ ...payload, user_id: me }))
        toast.success("회의록을 만들었어요.")
      }
      onSaved()
    } catch {
      toast.error("저장에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!note?.id) return
    if (!confirm("이 회의록을 삭제할까요?")) return
    setBusy(true)
    try {
      await mustOk(supabase.from("meeting_notes").delete().eq("id", note.id))
      // 첨부 정리(본인 폴더 한정·best-effort) — 노트 삭제 시 스토리지 고아 방지.
      if (note.attachment_path && note.attachment_path.startsWith(`${me}/`)) {
        await supabase.storage.from(FILES_BUCKET).remove([note.attachment_path])
      }
      toast.success("삭제했어요.")
      onDeleted()
    } catch {
      toast.error("삭제에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 상단 바 */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={handleBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> 목록
        </button>
        {canEdit ? (
          <div className="flex items-center gap-1.5">
            {note?.id && (
              <Button variant="ghost" size="sm" onClick={remove} disabled={busy} className="text-destructive hover:text-destructive">
                <Trash2 className="size-3.5" /> 삭제
              </Button>
            )}
            <Button size="sm" onClick={save} disabled={busy}>
              {busy && <Loader2 className="size-3.5 animate-spin" />} 저장
            </Button>
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground">읽기 전용{authorName ? ` · ${authorName}` : ""}</span>
        )}
      </div>

      {canEdit ? (
        <>
          {/* 메타 */}
          <input
            className={cn(fieldClass, "h-10 text-base font-semibold")}
            placeholder="회의 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <input type="date" className={cn(fieldClass, "w-auto")} value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
            <input
              className={cn(fieldClass, "min-w-48 flex-1")}
              placeholder="참석자 (예: 김대표, 박과장)"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
            />
          </div>

          {/* AI 보조 — 작성하는 곳 바로 위에 상시 */}
          <MeetingAiAssist
            getText={() => content}
            onAppend={(t) => setContent((c) => (c.trim() ? `${c}\n\n${t}` : t))}
            onReplace={(t) => setContent(t)}
            disabled={busy}
          />

          <textarea
            className={cn(fieldClass, "h-auto min-h-[280px] resize-y py-2 leading-relaxed")}
            placeholder="회의 내용을 적어 주세요. 거친 메모도 좋아요 — AI 보조로 정리·요약·액션아이템을 뽑을 수 있어요."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />

          {/* 첨부 */}
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" className="hidden" onChange={onPickFile} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
              {att.path ? "파일 변경" : "파일 첨부"}
            </Button>
            {att.path && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
                <span className="max-w-48 truncate">{att.name}</span>
                {att.size ? <span className="text-muted-foreground">{fmtBytes(att.size)}</span> : null}
                {savedAttachment && (
                  <button onClick={openAttachment} className="text-muted-foreground hover:text-foreground" aria-label="열기">
                    <Download className="size-3.5" />
                  </button>
                )}
                <button onClick={() => setAtt({ path: null, name: null, size: null })} className="text-muted-foreground hover:text-destructive" aria-label="첨부 제거">
                  <X className="size-3.5" />
                </button>
              </span>
            )}
            {att.path && !savedAttachment && <span className="text-[11px] text-muted-foreground">저장하면 팀이 열람할 수 있어요</span>}
          </div>
        </>
      ) : (
        /* 읽기 전용 */
        <div className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold">{note?.title || "(제목 없음)"}</h1>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {note?.meeting_date && <span>📅 {note.meeting_date}</span>}
            {note?.attendees && <span>👥 {note.attendees}</span>}
          </div>
          <div className="whitespace-pre-wrap break-words rounded-xl border bg-card p-4 text-sm leading-relaxed">
            {note?.content || <span className="text-muted-foreground">내용이 없습니다.</span>}
          </div>
          {att.path && (
            <div>
              <Button variant="outline" size="sm" onClick={openAttachment}>
                <Download className="size-3.5" /> {att.name ?? "첨부 파일"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
