"use client"

// 회의록 에디터 셸 — P0 분해 후: 상태(제목·메타·본문·그래프)와 저장/삭제/PDF만 소유하고,
// 헤더(MeetingHeader) · AI 보조(AiAssistPanel) · 리서치 워크벤치(ResearchPanel) · 본문(MeetingDocEditor)을 조립한다.
// 분해 전 879줄 모놀리스의 역할 분리 — P1(전사·아이디어)·P3(연결·액션아이템)가 각 패널에 얹힌다.
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { Editor } from "@tiptap/react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { useNoteViewers } from "@/hooks/usePresence"
import { mustOk } from "@/lib/supabase/mustOk"
import { MeetingDocEditor } from "./editor/MeetingDocEditor"
import { MeetingHeader } from "./MeetingHeader"
import { AiAssistPanel } from "./AiAssistPanel"
import { ResearchPanel } from "./ResearchPanel"
import { TranscriptPanel } from "./TranscriptPanel"
import { RelatedSidebar } from "./RelatedSidebar"
import { ActionItemsSection } from "./ActionItemsSection"
import { IdeaCaptureDialog } from "@/components/ideas/IdeaCaptureDialog"
import { PRINT_CSS, escapeHtml, type GraphData } from "./meetingContent"
import type { ParsedTranscript } from "@/lib/transcript"
import type { Tables, Json } from "@/lib/supabase/types"

type Note = Tables<"meeting_notes">

export function MeetingEditor({
  note,
  me,
  isAdmin,
  authorName,
  authorPosition,
  names = {},
  onBack,
  onSaved,
  onDeleted,
  onOpenNote,
}: {
  note: Note | null
  me: string
  isAdmin: boolean
  authorName?: string
  authorPosition?: string | null
  /** id→이름 (presence "보는 중" 표시용 — 없으면 표시 생략) */
  names?: Record<string, string>
  onBack: () => void
  onSaved: () => void
  onDeleted: () => void
  /** 관련 회의(사이드카)에서 다른 노트 열기 — 미저장 변경이 있으면 확인 후(P2) */
  onOpenNote?: (noteId: string) => void
}) {
  const supabase = createClient()
  const wsId = useCurrentWorkspaceId() // B1-b
  const canEdit = !note || note.user_id === me || isAdmin

  const init = useMemo(
    () => ({
      title: note?.title ?? "",
      meetingDate: note?.meeting_date ?? new Date().toLocaleDateString("en-CA"),
      attendees: note?.attendees ?? "",
      content: note?.content ?? "",
      graph: (note?.graph as GraphData | null) ?? null,
      transcript: (note?.transcript as ParsedTranscript | null) ?? null,
    }),
    [note]
  )

  const [title, setTitle] = useState(init.title)
  const [meetingDate, setMeetingDate] = useState(init.meetingDate)
  const [attendees, setAttendees] = useState(init.attendees)
  const [content, setContent] = useState(init.content) // 본문 HTML
  const [graphData, setGraphData] = useState<GraphData | null>(init.graph)
  const [transcript, setTranscript] = useState<ParsedTranscript | null>(init.transcript) // P1 전사(본문과 분리)
  const [pendingRaw, setPendingRaw] = useState<string | null>(null) // 붙여넣기에서 감지된 전사(선택 대기)
  const [ideaDraft, setIdeaDraft] = useState<string | null>(null) // 아이디어 캡처 다이얼로그(null=닫힘)
  const [projectId, setProjectId] = useState<string | null>(note?.project_id ?? null) // P3 연결(RPC로 즉시 저장 — dirty 아님)
  const [busy, setBusy] = useState(false)
  const [researchOpen, setResearchOpen] = useState(false)
  const editorRef = useRef<Editor | null>(null)

  // 같은 노트를 보고 있는 다른 멤버 — 라스트라이트윈 충돌의 사전 신호(P0)
  const viewers = useNoteViewers(note?.id ?? null, me)
  const viewerNames = [...viewers].map((id) => names[id]).filter((n): n is string => !!n)

  const dirty =
    canEdit &&
    (title !== init.title ||
      meetingDate !== init.meetingDate ||
      attendees !== init.attendees ||
      content !== init.content ||
      JSON.stringify(graphData) !== JSON.stringify(init.graph) ||
      JSON.stringify(transcript) !== JSON.stringify(init.transcript))

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
        graph: graphData,
        transcript: transcript as unknown as Json,
      }
      if (note?.id) {
        // 편집 충돌 완화(P0) — 라스트라이트윈이라, 내가 여는 사이 다른 사람이 저장했으면 덮어쓰기 전에 확인.
        const { data: cur } = await supabase.from("meeting_notes").select("updated_at").eq("id", note.id).maybeSingle()
        if (cur && note.updated_at && cur.updated_at !== note.updated_at) {
          if (!confirm("다른 사람이 이 회의록을 먼저 수정했어요. 그래도 내 내용으로 덮어쓸까요?\n(취소하면 저장하지 않아요 — 새 탭에서 최신 내용을 확인해 보세요.)")) {
            setBusy(false)
            return
          }
        }
        await mustOk(
          supabase
            .from("meeting_notes")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", note.id)
        )
        toast.success("회의록을 저장했어요.")
      } else {
        await mustOk(supabase.from("meeting_notes").insert({ ...payload, user_id: me, workspace_id: wsId as string }))
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

  // PDF 저장 — 새 창에 정리본만 렌더 → 브라우저 인쇄(PDF로 저장). 의존성 0, 한글 폰트 안전.
  const exportPdf = () => {
    const html = editorRef.current?.getHTML() ?? content
    const win = window.open("", "_blank", "width=860,height=1000")
    if (!win) {
      toast.error("팝업이 차단됐어요. 팝업 허용 후 다시 시도해 주세요.")
      return
    }
    const meta = [meetingDate, attendees].filter(Boolean).map(escapeHtml).join(" · ")
    win.document.write(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title || "회의록")}</title><style>${PRINT_CSS}</style></head><body><main class="doc"><h1 class="doc-title">${escapeHtml(title || "제목 없음")}</h1>${meta ? `<p class="doc-meta">${meta}</p>` : ""}<div class="meeting-doc">${html}</div></main><scr` +
        `ipt>window.onload=function(){setTimeout(function(){window.focus();window.print()},300)}</scr` +
        `ipt></body></html>`
    )
    win.document.close()
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <MeetingHeader
        canEdit={canEdit}
        busy={busy}
        hasNote={!!note?.id}
        authorName={authorName}
        authorPosition={authorPosition}
        viewerNames={viewerNames}
        title={title}
        onTitleChange={setTitle}
        meetingDate={canEdit ? meetingDate : (note?.meeting_date ?? "")}
        onMeetingDateChange={setMeetingDate}
        attendees={canEdit ? attendees : (note?.attendees ?? "")}
        onAttendeesChange={setAttendees}
        noteId={note?.id ?? null}
        projectId={projectId}
        onProjectChange={setProjectId}
        onBack={handleBack}
        onSave={save}
        onRemove={remove}
        onExportPdf={exportPdf}
      />

      {/* AI 보조 — 작성하는 곳 옆에 상시 */}
      {canEdit && (
        <AiAssistPanel editorRef={editorRef} disabled={busy} onToggleResearch={() => setResearchOpen((o) => !o)} />
      )}

      {/* 전사(P1) — 붙여넣기 감지 배너 + 보관된 전사 + 메모 완성(Enhance) */}
      <TranscriptPanel
        canEdit={canEdit}
        transcript={transcript}
        setTranscript={setTranscript}
        pendingRaw={pendingRaw}
        setPendingRaw={setPendingRaw}
        editorRef={editorRef}
        meta={[title, meetingDate, attendees].filter(Boolean).join(" · ")}
      />

      {/* 리서치 워크벤치 + 저장된 꼬리물기 그래프 복원 */}
      <ResearchPanel
        open={researchOpen}
        onClose={() => setResearchOpen(false)}
        canEdit={canEdit}
        editorRef={editorRef}
        graphData={graphData}
        setGraphData={setGraphData}
        title={title}
      />

      {/* 본문 — Tiptap 블록 에디터 */}
      <div className="mt-5 min-h-[45vh]">
        <MeetingDocEditor
          value={init.content}
          editable={canEdit}
          onChange={setContent}
          editorRef={editorRef}
          onIdeaCapture={canEdit ? (text) => setIdeaDraft(text) : undefined}
          onTranscriptDetected={canEdit ? setPendingRaw : undefined}
        />
      </div>

      {/* 회의에서 나온 할 일(P3) — 추출·담당자 확인·내 할 일로 가져오기. 저장된 노트에서만. */}
      <ActionItemsSection noteId={note?.id ?? null} me={me} canEdit={canEdit} names={names} editorRef={editorRef} />

      {/* 관련 회의 사이드카(P2) — 비슷한 얘기를 했던 과거 회의(결과 없으면 미렌더, xl 전용) */}
      {onOpenNote && (
        <RelatedSidebar
          currentNoteId={note?.id ?? null}
          title={title}
          onOpenNote={(id) => {
            if (dirty && !confirm("저장하지 않은 변경이 있어요. 다른 회의록으로 이동할까요?")) return
            onOpenNote(id)
          }}
        />
      )}

      {/* 아이디어 캡처(P1) — 선택 텍스트 또는 빈 손으로 창고에 담기 */}
      {ideaDraft !== null && (
        <IdeaCaptureDialog
          me={me}
          sourceNoteId={note?.id ?? null}
          initialText={ideaDraft}
          onClose={() => setIdeaDraft(null)}
        />
      )}
    </div>
  )
}
