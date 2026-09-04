"use client"

import { useEffect, useMemo, type MutableRefObject } from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import { toast } from "sonner"
import { uploadMeetingMedia } from "@/lib/upload"
import { detectAndParseTranscript } from "@/lib/transcript"
import { buildMeetingExtensions } from "./extensions"
import { TableMenu, TextMenu, ImageMenu } from "./EditorMenus"
import type { SlashHandlers } from "./slashItems"

const MAX_BYTES = 50 * 1024 * 1024 // 50MB

/** 즉석 파일 선택창(ref 불필요). 선택 시 cb 호출. */
function pickFile(accept: string, cb: (file: File) => void) {
  const input = document.createElement("input")
  input.type = "file"
  if (accept) input.accept = accept
  input.onchange = () => {
    const f = input.files?.[0]
    if (f) cb(f)
  }
  input.click()
}

async function uploadAndInsert(editor: Editor, file: File, kind: "image" | "file") {
  if (file.size > MAX_BYTES) {
    toast.error("50MB 이하 파일만 올릴 수 있어요.")
    return
  }
  const toastId = toast.loading(kind === "image" ? "이미지 업로드 중…" : "파일 업로드 중…")
  try {
    const up = await uploadMeetingMedia(file, { download: kind === "file" })
    if (kind === "image") {
      editor.chain().focus().setImage({ src: up.url, alt: up.name }).run()
    } else {
      editor
        .chain()
        .focus()
        .insertContent({ type: "fileBlock", attrs: { src: up.url, name: up.name, size: up.size, mime: up.mimeType } })
        .run()
    }
    toast.success("올렸어요.", { id: toastId })
  } catch (e) {
    toast.error((e as Error).message || "업로드에 실패했어요.", { id: toastId })
  }
}

/**
 * 회의록 본문 — Tiptap 블록 에디터. 슬래시(/) 메뉴로 블록 삽입, 이미지/파일(모든 형식) 인라인 업로드.
 * 본문은 HTML로 onChange 전달(저장용). 부모는 editorRef로 plain text(AI)·명령(append/replace)을 쓴다.
 */
export function MeetingDocEditor({
  value,
  editable,
  placeholder = "'/'를 입력해 명령어 사용",
  onChange,
  editorRef,
  onIdeaCapture,
  onTranscriptDetected,
}: {
  value: string
  editable: boolean
  placeholder?: string
  onChange?: (html: string) => void
  editorRef?: MutableRefObject<Editor | null>
  /** 아이디어 캡처(P1) — 선택 텍스트(슬래시는 빈 문자열)와 함께 캡처 다이얼로그 열기 */
  onIdeaCapture?: (selectedText: string) => void
  /** 전사 감지(P1) — 500자+ 붙여넣기가 전사 형식이면 기본 삽입을 막고 호출(사용자 선택으로 위임) */
  onTranscriptDetected?: (raw: string) => void
}) {
  // 슬래시 메뉴 → 업로드 트리거. editor는 커맨드 인자로 받으므로 ref 불필요(안정 참조).
  const handlers = useMemo<SlashHandlers>(
    () => ({
      onImage: (editor) => pickFile("image/*", (f) => void uploadAndInsert(editor, f, "image")),
      onFile: (editor) => pickFile("", (f) => void uploadAndInsert(editor, f, "file")),
      ...(onIdeaCapture ? { onIdea: () => onIdeaCapture("") } : {}),
    }),
    [onIdeaCapture]
  )

  const extensions = useMemo(() => buildMeetingExtensions({ placeholder, handlers }), [placeholder, handlers])

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions,
    content: value,
    editorProps: {
      attributes: { class: "meeting-doc focus:outline-none", spellcheck: "true", "aria-label": "회의 내용" },
      // 전사 자동 감지(P1) — 형식이 확실할 때만 기본 붙여넣기를 막고 배너(사용자 선택)로 위임.
      // 일반 붙여넣기는 절대 방해하지 않는다(무끊김 원칙 — 파서는 확실한 형식만 매치).
      handlePaste: (view, event) => {
        if (!onTranscriptDetected) return false
        const text = event.clipboardData?.getData("text/plain") ?? ""
        // 300자 미만은 검사 안 함 — 파서가 형식(화자·타임스탬프 반복)을 엄격히 요구하므로
        // 이 임계값은 성능 가드일 뿐 오탐 방어가 아니다(짧은 일반 붙여넣기까지 파서를 태우지 않기).
        if (text.length < 300) return false
        const parsed = detectAndParseTranscript(text)
        if (!parsed) return false
        onTranscriptDetected(text)
        return true // 기본 삽입 차단 — 배너에서 [전사로 저장] 또는 [본문에 붙여넣기] 선택
      },
    },
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  })

  useEffect(() => {
    if (editorRef) editorRef.current = editor
    return () => {
      if (editorRef) editorRef.current = null
    }
  }, [editor, editorRef])

  return (
    <>
      <EditorContent editor={editor} />
      {editor && editable && <TextMenu editor={editor} onIdea={onIdeaCapture} />}
      {editor && editable && <TableMenu editor={editor} />}
      {editor && editable && <ImageMenu editor={editor} />}
    </>
  )
}
