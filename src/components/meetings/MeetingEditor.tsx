"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ArrowLeft, Trash2, Loader2, Calendar, Users, Sparkles, Plus, RefreshCw, X } from "lucide-react"
import type { Editor } from "@tiptap/react"
import type { JSONContent } from "@tiptap/core"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { Button } from "@/components/ui/button"
import { MeetingDocEditor } from "./editor/MeetingDocEditor"
import { useMeetingAi, AI_ACTION_LABEL, type AiAction } from "./useMeetingAi"
import type { Tables } from "@/lib/supabase/types"

type Note = Tables<"meeting_notes">
const AI_ACTIONS: AiAction[] = ["summarize", "actions", "polish"]

/** AI 평문 결과를 문단 노드로 — 본문(Tiptap)에 삽입/교체용. */
function linesToContent(text: string): JSONContent[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => (l.trim() ? { type: "paragraph", content: [{ type: "text", text: l }] } : { type: "paragraph" }))
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

  const init = useMemo(
    () => ({
      title: note?.title ?? "",
      meetingDate: note?.meeting_date ?? new Date().toLocaleDateString("en-CA"),
      attendees: note?.attendees ?? "",
      content: note?.content ?? "",
    }),
    [note]
  )

  const [title, setTitle] = useState(init.title)
  const [meetingDate, setMeetingDate] = useState(init.meetingDate)
  const [attendees, setAttendees] = useState(init.attendees)
  const [content, setContent] = useState(init.content) // 본문 HTML
  const [busy, setBusy] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const editorRef = useRef<Editor | null>(null)

  const ai = useMeetingAi(() => editorRef.current?.getText() ?? "")

  useEffect(() => {
    const t = titleRef.current
    if (t) {
      t.style.height = "auto"
      t.style.height = `${t.scrollHeight}px`
    }
  }, [])

  const dirty =
    canEdit &&
    (title !== init.title || meetingDate !== init.meetingDate || attendees !== init.attendees || content !== init.content)

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

  const sizeTitle = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    t.style.height = "auto"
    t.style.height = `${t.scrollHeight}px`
  }

  const aiAppend = () => {
    const r = ai.result?.trim()
    if (r) editorRef.current?.chain().focus("end").insertContent(linesToContent(r)).run()
    ai.close()
  }
  const aiReplace = () => {
    const r = ai.result?.trim()
    if (!r) {
      ai.close()
      return
    }
    if (editorRef.current && editorRef.current.getText().trim() && !confirm("현재 본문을 AI 결과로 덮어쓸까요? 기존 내용은 사라집니다.")) return
    editorRef.current?.commands.setContent({ type: "doc", content: linesToContent(r) })
    ai.close()
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
      toast.success("삭제했어요.")
      onDeleted()
    } catch {
      toast.error("삭제에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* 상단 바 */}
      <div className="mb-6 flex items-center justify-between gap-2">
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

      {/* 제목 — 보더 없는 큰 텍스트 */}
      {canEdit ? (
        <textarea
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onInput={sizeTitle}
          rows={1}
          placeholder="제목 없음"
          className="w-full resize-none border-0 bg-transparent p-0 text-3xl font-bold leading-tight outline-none placeholder:text-muted-foreground/40 focus-visible:ring-0"
        />
      ) : (
        <h1 className="text-3xl font-bold leading-tight">{note?.title || "제목 없음"}</h1>
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
                onChange={(e) => setMeetingDate(e.target.value)}
                className="border-0 bg-transparent p-0 text-xs text-foreground outline-none focus-visible:ring-0"
              />
            </label>
            <label className="inline-flex min-w-0 flex-1 items-center gap-1.5">
              <Users className="size-3.5 shrink-0" />
              <input
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="참석자 추가"
                className="w-full border-0 bg-transparent p-0 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
              />
            </label>
          </>
        ) : (
          <>
            {note?.meeting_date && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5" /> {note.meeting_date}
              </span>
            )}
            {note?.attendees && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" /> {note.attendees}
              </span>
            )}
          </>
        )}
      </div>

      {/* AI 보조 — 작성하는 곳 옆에 상시 */}
      {canEdit && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Sparkles className="size-3" /> AI
            </span>
            {AI_ACTIONS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => ai.run(a)}
                disabled={busy || ai.busy}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {ai.busy && ai.active === a && <Loader2 className="size-3 animate-spin" />}
                {AI_ACTION_LABEL[a]}
              </button>
            ))}
            <span className="text-[11px] text-muted-foreground/70">· 본문에서 <kbd className="rounded bg-muted px-1">/</kbd> 입력</span>
          </div>

          {ai.result !== null && (
            <div className="mt-2 rounded-lg border bg-muted/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {ai.active ? AI_ACTION_LABEL[ai.active] : ""} 결과 (미리보기)
                </span>
                <button onClick={ai.close} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-sm">
                {ai.result || <span className="text-muted-foreground">생성 중…</span>}
              </div>
              <div className="mt-2.5 flex justify-end gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={aiAppend} disabled={ai.busy || !ai.result.trim()}>
                  <Plus className="size-3.5" /> 본문에 추가
                </Button>
                <Button type="button" size="sm" onClick={aiReplace} disabled={ai.busy || !ai.result.trim()}>
                  <RefreshCw className="size-3.5" /> 전체 교체
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 본문 — Tiptap 블록 에디터 */}
      <div className="mt-5 min-h-[45vh]">
        <MeetingDocEditor
          value={init.content}
          editable={canEdit}
          onChange={setContent}
          editorRef={editorRef}
        />
      </div>
    </div>
  )
}
