"use client"

// 창고에 질문 — 회의노트 대개편 P2 (Granola "chat with folders" 패턴).
// 회의록·아이디어 전체를 횡단 질의하는 우측 시트. 답변의 인용 링크([제목](/meetings?note=id))를
// 클릭하면 페이지 이동 없이 해당 회의록을 그 자리에서 연다(무끊김).
import { useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ArrowUp, Loader2, MessageCircleQuestion, Square, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "@/components/shared/Markdown"

function messageText(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")
}

/** 어떤 도구가 도는 중인지 — 위젯과 같은 라이브 상태 칩(경량판). */
function runningTools(m: UIMessage): string[] {
  return m.parts.flatMap((p) => {
    const isDyn = p.type === "dynamic-tool"
    if (!isDyn && !p.type.startsWith("tool-")) return []
    const part = p as { type: string; toolName?: string; state?: string }
    if (part.state === "output-available" || part.state === "output-error") return []
    return [(isDyn ? part.toolName : p.type.slice(5)) || "도구"]
  })
}

const SUGGESTIONS = ["최근 회의에서 결정된 것들 정리해줘", "반복해서 나온 문제가 있어?", "보류 중인 아이디어 뭐가 있지?"]

export function MeetingsChat({
  open,
  onClose,
  onOpenNote,
}: {
  open: boolean
  onClose: () => void
  onOpenNote: (noteId: string) => void
}) {
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/meeting-notes/chat" }), [])
  const { messages, sendMessage, status, error, stop, clearError } = useChat({
    transport,
    experimental_throttle: 50, // 스트리밍 렌더 배칭 — 위젯·컴피와 동일(품질 기준)
  })
  const loading = status === "submitted" || status === "streaming"

  const submit = (text?: string) => {
    const t = (text ?? input).trim()
    if (!t || (status !== "ready" && status !== "error")) return
    clearError()
    sendMessage({ text: t })
    setInput("")
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }))
  }

  // 인용 링크(/meetings?note=<id>) 클릭을 가로채 제자리에서 노트 열기
  const interceptCitation = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a")
    if (!a) return
    const m = a.getAttribute("href")?.match(/\/meetings\?note=([0-9a-f-]{36})/)
    if (!m) return
    e.preventDefault()
    onOpenNote(m[1])
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l bg-card shadow-[var(--shadow-lg)]">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <MessageCircleQuestion className="size-4 text-primary" />
        <span className="text-sm font-semibold">창고에 질문</span>
        <span className="text-[11px] text-muted-foreground">회의록·아이디어 전체를 근거와 함께</span>
        <span className="flex-1" />
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
          <X className="size-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 [scrollbar-width:thin]" onClick={interceptCitation}>
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <MessageCircleQuestion className="size-8 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">회의록이 쌓일수록 똑똑해져요. 답변엔 근거 회의록 링크가 붙어요.</p>
            <div className="mt-2 flex w-full flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-xl border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => {
            const text = messageText(m)
            const tools = m.role === "assistant" ? runningTools(m) : []
            return m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="max-w-full rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">
                {loading && tools.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1">
                    {tools.map((t, i) => (
                      <span key={`${t}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" /> {t === "search_meeting_notes" ? "회의록 검색 중" : t === "get_meeting_note" ? "회의록 읽는 중" : t === "list_ideas" ? "아이디어 확인 중" : "찾는 중"}…
                      </span>
                    ))}
                  </div>
                )}
                {text ? <Markdown>{text}</Markdown> : <span className="text-muted-foreground">창고를 뒤지는 중…</span>}
              </div>
            )
          })
        )}
        {error && (
          <p className="text-xs text-destructive">{error.message || "질문에 답하지 못했어요."} — 다시 시도해 보세요.</p>
        )}
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-1.5 rounded-3xl border bg-muted/40 py-1.5 pl-4 pr-1.5 focus-within:border-ring focus-within:bg-card">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="회의록·아이디어에 물어보기…"
            rows={1}
            className="max-h-28 flex-1 resize-none self-center bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading ? (
            <button onClick={() => void stop()} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background" aria-label="중단">
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              onClick={() => submit()}
              disabled={!input.trim()}
              className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all", "hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100")}
              aria-label="질문"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
