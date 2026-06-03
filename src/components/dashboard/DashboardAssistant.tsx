"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { Search, ArrowUp, Sparkles, Loader2, RotateCcw } from "lucide-react"

function messageText(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")
}

/** 대시보드 메인 — 범용 Claude 어시스턴트 채팅(우리 디자인). */
export function DashboardAssistant() {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/assistant" }), [])
  const { messages, sendMessage, status, error, setMessages } = useChat({ transport })
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasChat = messages.length > 0

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages, status])

  const submit = () => {
    const t = input.trim()
    if (!t || status !== "ready") return
    sendMessage({ text: t })
    setInput("")
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      {!hasChat && (
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <div className="relative">
            <div className="animate-aura absolute -inset-2 -z-10 rounded-full bg-primary/25 blur-xl" />
            <div className="animate-soft-pulse grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-sm">
              <Sparkles className="size-6" />
            </div>
          </div>
          <p className="text-xl font-semibold tracking-tight">무엇을 도와드릴까요?</p>
          <p className="text-sm text-muted-foreground">이큐리아 어시스턴트에게 무엇이든 물어보세요.</p>
        </div>
      )}

      {hasChat && (
        <div
          ref={scrollRef}
          className="mb-3 max-h-[48vh] space-y-4 overflow-y-auto px-1 py-2 [scrollbar-width:thin]"
        >
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground shadow-sm">
                  {messageText(m)}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2.5">
                <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-3.5" />
                </div>
                <div className="max-w-[82%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5 text-sm leading-relaxed">
                  {messageText(m) || <span className="text-muted-foreground">생각 중…</span>}
                </div>
              </div>
            )
          )}
          {error && <p className="pl-9 text-xs text-destructive">오류: {error.message}</p>}
        </div>
      )}

      {/* 입력 바 */}
      <div className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-2.5 shadow-lg shadow-primary/5 transition-all focus-within:border-ring focus-within:shadow-primary/10 focus-within:ring-4 focus-within:ring-ring/15">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="무엇이든 물어보세요…"
          rows={1}
          className="max-h-32 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        {hasChat && (
          <button
            onClick={() => {
              setMessages([])
              setInput("")
            }}
            title="새 대화"
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-4" />
          </button>
        )}
        <button
          onClick={submit}
          disabled={status !== "ready" || !input.trim()}
          aria-label="전송"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
        >
          {status === "streaming" ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </div>
    </div>
  )
}
