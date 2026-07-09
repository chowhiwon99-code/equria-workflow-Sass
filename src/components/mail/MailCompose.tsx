"use client"

import { useRef, useState, type ReactNode } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import Placeholder from "@tiptap/extension-placeholder"
import { toast } from "sonner"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Link2,
  Paperclip,
  X,
  Send,
  Loader2,
} from "lucide-react"
import { fieldClass } from "@/components/shared/Modal"
import { Button } from "@/components/ui/button"
import { CHAT_EXTENSIONS } from "@/lib/tiptap"
import { formatBytes } from "@/lib/files"
import { cn } from "@/lib/utils"
import { MailAiAssist } from "./MailAiAssist"

export type ComposeInitial = {
  to?: string
  cc?: string
  subject?: string
  threadId?: string
  inReplyTo?: string
  references?: string
}
type Attachment = { filename: string; mimeType: string; contentBase64: string; size: number }

// Vercel 서버리스 요청 본문 4.5MB 제한 + base64 팽창(×1.33) 감안 → 합계 3MB 가드.
// (더 큰 첨부는 Gmail 미디어 업로드 직접 경로 필요 — known-issues 참고)
const MAX_TOTAL = 3 * 1024 * 1024

/** 서식 툴바 버튼 — onMouseDown preventDefault로 에디터 선택 유지. */
function Tool({ on, active, label, children }: { on: () => void; active?: boolean; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted",
        active && "bg-muted text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result)
      resolve(s.slice(s.indexOf(",") + 1)) // data:...;base64, 프리픽스 제거
    }
    r.onerror = () => reject(new Error("파일을 읽지 못했어요."))
    r.readAsDataURL(f)
  })
}

/** Gmail식 메일 작성 패널 — 우측 하단 도킹(배경 어둡게 X). 리치 본문·첨부·AI 다듬기·전송. */
export default function MailCompose({
  initial,
  onClose,
  onSent,
}: {
  initial: ComposeInitial
  onClose: () => void
  onSent: () => void
}) {
  const [to, setTo] = useState(initial.to ?? "")
  const [cc, setCc] = useState(initial.cc ?? "")
  const [bcc, setBcc] = useState("")
  const [subject, setSubject] = useState(initial.subject ?? "")
  const [showCc, setShowCc] = useState(Boolean(initial.cc))
  const [showBcc, setShowBcc] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 닫기 모션(작아지며 사라짐) 후 실제 언마운트.
  function animateClose(done: () => void) {
    setClosing(true)
    window.setTimeout(done, 200)
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [...CHAT_EXTENSIONS, Placeholder.configure({ placeholder: "내용을 입력하세요" })],
    editorProps: {
      attributes: {
        spellcheck: "true",
        class: "tiptap-input min-h-[150px] max-h-[36vh] overflow-y-auto text-sm focus:outline-none",
        "aria-label": "메일 본문",
      },
    },
  })

  async function addFiles(list: FileList) {
    const incoming = Array.from(list)
    let total = attachments.reduce((s, a) => s + a.size, 0)
    for (const f of incoming) {
      if (total + f.size > MAX_TOTAL) {
        toast.error("첨부가 너무 커요(현재 합계 3MB 이하만 전송 가능).")
        break
      }
      try {
        const contentBase64 = await fileToBase64(f)
        total += f.size
        setAttachments((a) => [
          ...a,
          { filename: f.name, mimeType: f.type || "application/octet-stream", contentBase64, size: f.size },
        ])
      } catch {
        toast.error(`${f.name} 첨부에 실패했어요.`)
      }
    }
  }

  function setLink() {
    if (!editor) return
    const prev = editor.getAttributes("link").href
    const url = window.prompt("링크 URL", typeof prev === "string" ? prev : "https://")
    if (url === null) return
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    if (!/^(https?:|mailto:)/i.test(url)) {
      toast.error("http/https/mailto 링크만 넣을 수 있어요.")
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }

  async function send() {
    if (!to.trim()) {
      toast.error("받는 사람을 입력하세요.")
      return
    }
    setSending(true)
    try {
      const html = editor?.getHTML() ?? ""
      const res = await fetch("/api/google/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
          subject,
          html,
          attachments: attachments.map(({ filename, mimeType, contentBase64 }) => ({ filename, mimeType, contentBase64 })),
          threadId: initial.threadId,
          inReplyTo: initial.inReplyTo,
          references: initial.references,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "전송에 실패했어요.")
      toast.success("메일을 보냈어요.")
      animateClose(onSent)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "전송 오류")
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 flex max-h-[calc(100dvh-2rem)] w-[460px] max-w-[calc(100vw-2rem)] origin-bottom-right flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl duration-200",
        closing
          ? "animate-out fade-out-0 zoom-out-95 slide-out-to-bottom-4"
          : "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4"
      )}
    >
      {/* 헤더 바(Gmail식 짙은 바) */}
      <div className="flex items-center justify-between bg-foreground px-4 py-2.5 text-background">
        <span className="text-sm font-semibold">{initial.threadId ? "답장" : "새 메일"}</span>
        <button type="button" onClick={() => animateClose(onClose)} aria-label="닫기" className="rounded p-0.5 transition-colors hover:bg-white/15">
          <X className="size-4" />
        </button>
      </div>

      {/* 본문 스크롤 영역 */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        <div className="flex items-center gap-2">
          <input
            className={cn(fieldClass, "flex-1")}
            placeholder="받는 사람 (이메일)"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <div className="flex shrink-0 gap-1 text-xs text-muted-foreground">
            {!showCc && (
              <button type="button" className="rounded px-1.5 py-1 hover:bg-muted hover:text-foreground" onClick={() => setShowCc(true)}>
                참조
              </button>
            )}
            {!showBcc && (
              <button type="button" className="rounded px-1.5 py-1 hover:bg-muted hover:text-foreground" onClick={() => setShowBcc(true)}>
                숨은참조
              </button>
            )}
          </div>
        </div>
        {showCc && <input className={fieldClass} placeholder="참조 (Cc)" value={cc} onChange={(e) => setCc(e.target.value)} />}
        {showBcc && <input className={fieldClass} placeholder="숨은참조 (Bcc)" value={bcc} onChange={(e) => setBcc(e.target.value)} />}
        <input className={fieldClass} placeholder="제목" value={subject} onChange={(e) => setSubject(e.target.value)} />

        {/* 서식 툴바 */}
        {editor && (
          <div className="flex items-center gap-0.5 rounded-lg border bg-muted/30 px-1.5 py-1">
            <Tool label="굵게" active={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()}>
              <Bold className="size-3.5" />
            </Tool>
            <Tool label="기울임" active={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()}>
              <Italic className="size-3.5" />
            </Tool>
            <Tool label="밑줄" active={editor.isActive("underline")} on={() => editor.chain().focus().toggleUnderline().run()}>
              <UnderlineIcon className="size-3.5" />
            </Tool>
            <Tool label="취소선" active={editor.isActive("strike")} on={() => editor.chain().focus().toggleStrike().run()}>
              <Strikethrough className="size-3.5" />
            </Tool>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <Tool label="글머리 목록" active={editor.isActive("bulletList")} on={() => editor.chain().focus().toggleBulletList().run()}>
              <List className="size-3.5" />
            </Tool>
            <Tool label="번호 목록" active={editor.isActive("orderedList")} on={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered className="size-3.5" />
            </Tool>
            <Tool label="링크" active={editor.isActive("link")} on={setLink}>
              <Link2 className="size-3.5" />
            </Tool>
          </div>
        )}

        {/* 본문 */}
        <div className="rounded-lg border px-3 py-2">
          <EditorContent editor={editor} />
        </div>

        {/* 첨부 목록 */}
        {attachments.length > 0 && (
          <div className="flex flex-col gap-1">
            {attachments.map((a, i) => (
              <div key={`${a.filename}-${i}`} className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1 text-xs">
                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(a.size)}</span>
                <button
                  type="button"
                  aria-label="첨부 삭제"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setAttachments((arr) => arr.filter((_, idx) => idx !== i))}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 하단 액션 바 */}
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        <div className="flex items-center gap-1.5">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files)
              e.target.value = ""
            }}
          />
          <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()} title="파일 첨부">
            <Paperclip /> 첨부
          </Button>
          <MailAiAssist editor={editor} />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => animateClose(onClose)}>
            취소
          </Button>
          <Button size="sm" onClick={send} disabled={sending}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            보내기
          </Button>
        </div>
      </div>
    </div>
  )
}
