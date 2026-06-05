"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { useEditor, EditorContent } from "@tiptap/react"
import Placeholder from "@tiptap/extension-placeholder"
import { Bold, Italic, Strikethrough, Code, List, ListOrdered, Link2, Send, Type } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ComposerAiAssist } from "@/components/chat/ComposerAiAssist"
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
  placeholder = "메시지 입력…",
  leftSlot,
}: {
  onSend: (payload: ComposerPayload) => void | Promise<void>
  disabled?: boolean
  canSendEmpty?: boolean // 첨부 등 본문 외 전송거리가 있으면 빈 텍스트도 전송 허용
  placeholder?: string
  leftSlot?: ReactNode
}) {
  const submitRef = useRef<() => void>(() => {})
  const [showFormat, setShowFormat] = useState(false) // 서식 툴바 기본 숨김(애플식 심플)
  // Tiptap v3 useEditor는 트랜잭션마다 리렌더하지 않음 → editor.isEmpty를 직접 읽으면 stale.
  // 전송 버튼 활성/비활성은 onCreate/onUpdate로 동기화한 state로 판단(번역 적용 등 프로그램적 변경 포함).
  const [isEmpty, setIsEmpty] = useState(true)

  const editor = useEditor({
    immediatelyRender: false, // Next App Router SSR 하이드레이션 방지
    extensions: [...CHAT_EXTENSIONS, Placeholder.configure({ placeholder })],
    onCreate: ({ editor }) => setIsEmpty(editor.isEmpty),
    onUpdate: ({ editor }) => setIsEmpty(editor.isEmpty),
    editorProps: {
      attributes: {
        spellcheck: "true", // 네이티브 맞춤법 빨간 밑줄
        class: "tiptap-input max-h-40 overflow-y-auto py-1 text-sm focus:outline-none",
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
      setIsEmpty(true)
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
    <div
      className={cn(
        "flex flex-col gap-1 rounded-3xl border bg-muted/40 px-2.5 py-1.5 transition-colors focus-within:border-ring focus-within:bg-card",
        disabled && "opacity-60"
      )}
    >
      {/* 서식 툴바 — 기본 숨김(애플식 심플). Aa(서식) 토글로만 노출. 단축키(⌘B 등)는 항상 동작. */}
      {showFormat && (
        <div className="flex items-center gap-0.5 px-1 pb-1">
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
      )}
      <div className="flex items-center gap-1">
        {leftSlot}
        <div className="min-w-0 flex-1 px-1">
          <EditorContent editor={editor} />
        </div>
        {/* 서식 토글(Aa) — 호버 액션처럼 절제 */}
        <button
          type="button"
          aria-label="서식"
          aria-pressed={showFormat}
          title="서식"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowFormat((s) => !s)}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            showFormat && "bg-muted text-foreground"
          )}
        >
          <Type className="size-3.5" />
        </button>
        {/* AI 보조(단계6) — 다듬기·요약·번역 */}
        <ComposerAiAssist editor={editor} disabled={disabled} />
        <Button
          type="button"
          size="icon-sm"
          onClick={submit}
          disabled={disabled || (isEmpty && !canSendEmpty)}
          className="rounded-full"
        >
          <Send />
        </Button>
      </div>
    </div>
  )
}
