"use client"

import { useCallback, useEffect, useRef, type ReactNode } from "react"
import { toast } from "sonner"
import { useEditor, EditorContent } from "@tiptap/react"
import Placeholder from "@tiptap/extension-placeholder"
import { Bold, Italic, Strikethrough, Code, List, ListOrdered, Link2, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CHAT_EXTENSIONS, type JSONContent } from "@/lib/tiptap"

export type ComposerPayload = { text: string; bodyJson: JSONContent }

/** 툴바 버튼 — 모듈 레벨로 분리(렌더마다 재생성 방지). onMouseDown preventDefault로 에디터 선택 유지. */
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

/**
 * 리치 텍스트 메시지 컴포저(Tiptap 격리). 서식 툴바 + 네이티브 맞춤법 밑줄 + Enter 전송(IME 안전).
 * onSend로 { text(plain SSOT), bodyJson(리치) }를 올려 보낸다 — 첨부·답장 등 메시지 메타는 부모가 관리.
 * leftSlot: 첨부 버튼 등 좌측에 끼울 노드.
 */
export function RichComposer({
  onSend,
  disabled,
  canSendEmpty = false,
  placeholder = "메시지 입력…  (Enter 전송 · Shift+Enter 줄바꿈)",
  leftSlot,
}: {
  onSend: (payload: ComposerPayload) => void | Promise<void>
  disabled?: boolean
  canSendEmpty?: boolean // 첨부 등 본문 외 전송거리가 있으면 빈 텍스트도 전송 허용
  placeholder?: string
  leftSlot?: ReactNode
}) {
  const submitRef = useRef<() => void>(() => {})

  const editor = useEditor({
    immediatelyRender: false, // Next App Router SSR 하이드레이션 방지
    extensions: [...CHAT_EXTENSIONS, Placeholder.configure({ placeholder })],
    editorProps: {
      attributes: {
        spellcheck: "true", // 네이티브 맞춤법 빨간 밑줄
        class: "tiptap-input min-h-[2.5rem] max-h-40 overflow-y-auto py-1.5 text-sm focus:outline-none",
        "aria-label": "메시지 입력",
      },
      handleKeyDown: (_view, event) => {
        // Enter=전송 / Shift+Enter=줄바꿈 / IME 조합 중엔 전송 금지(한글 잔류 버그 방지)
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault()
          submitRef.current()
          return true
        }
        return false
      },
    },
  })

  const submit = useCallback(async () => {
    if (!editor || disabled) return
    const text = editor.getText().trim()
    if (!text && !canSendEmpty) return // 텍스트도 첨부도 없으면 무시
    try {
      await onSend({ text, bodyJson: editor.getJSON() })
      editor.commands.clearContent() // 성공 시에만 비움 — 실패하면 입력 보존(재시도 가능)
      editor.commands.focus()
    } catch {
      /* onSend가 throw하면 입력을 남겨 둔다 */
    }
  }, [editor, disabled, canSendEmpty, onSend])

  // handleKeyDown은 에디터 생성 시 한 번 고정되므로, 최신 submit을 ref로 전달(stale 클로저 방지)
  useEffect(() => {
    submitRef.current = submit
  }, [submit])

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes("link").href
    const url = window.prompt("링크 URL", typeof prev === "string" ? prev : "https://")
    if (url === null) return
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    // 저장 시점에도 스킴 검증(렌더 화이트리스트와 동일) — javascript:/data: 등 위험 URL 차단
    if (!/^(https?:|mailto:)/i.test(url)) {
      toast.error("http/https/mailto 링크만 넣을 수 있어요.")
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }, [editor])

  if (!editor) return null

  return (
    <div className={cn("flex flex-col gap-1.5 rounded-xl border px-2 py-1.5", disabled && "opacity-60")}>
      <div className="flex items-center gap-0.5">
        <Tool label="굵게" active={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="size-3.5" />
        </Tool>
        <Tool label="기울임" active={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="size-3.5" />
        </Tool>
        <Tool label="취소선" active={editor.isActive("strike")} on={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="size-3.5" />
        </Tool>
        <Tool label="인라인 코드" active={editor.isActive("code")} on={() => editor.chain().focus().toggleCode().run()}>
          <Code className="size-3.5" />
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
      <div className="flex items-end gap-2">
        {leftSlot}
        <div className="min-w-0 flex-1">
          <EditorContent editor={editor} />
        </div>
        <Button type="button" size="icon-sm" onClick={submit} disabled={disabled || (editor.isEmpty && !canSendEmpty)}>
          <Send />
        </Button>
      </div>
    </div>
  )
}
