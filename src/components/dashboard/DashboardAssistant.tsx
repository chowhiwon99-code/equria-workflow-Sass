"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ArrowUp, Sparkle, Loader2, Plus, Paperclip, Globe, Plug, X, SquarePen, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

type Convo = { id: string; title: string | null; updated_at: string }

function messageText(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")
}

/** 대시보드 메인 — 좌측 대화 사이드바 + 우측 범용 Claude 채팅(대화 영속화). */
export function DashboardAssistant() {
  const conversationIdRef = useRef<string | null>(null)
  const [conversationId, setConvId] = useState<string | null>(null)
  const setConversation = useCallback((id: string | null) => {
    conversationIdRef.current = id
    setConvId(id)
  }, [])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/assistant",
        body: () => ({ conversationId: conversationIdRef.current }),
        fetch: async (url, options) => {
          const res = await fetch(url, options)
          const cid = res.headers.get("X-Conversation-Id")
          if (cid) setConversation(cid)
          return res
        },
      }),
    [setConversation]
  )
  const { messages, sendMessage, status, error, setMessages } = useChat({ transport })

  const [input, setInput] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [convos, setConvos] = useState<Convo[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const hasChat = messages.length > 0

  const loadConvos = useCallback(async () => {
    const res = await fetch("/api/assistant/conversations")
    if (res.ok) setConvos((await res.json()).conversations ?? [])
  }, [])

  useEffect(() => {
    loadConvos()
  }, [loadConvos])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages, status])

  // 턴 완료 시 목록 갱신(새 대화방·제목 반영)
  useEffect(() => {
    if (status === "ready" && messages.length > 0) void loadConvos()
  }, [status, messages.length, loadConvos])

  const submit = () => {
    const t = input.trim()
    if ((!t && files.length === 0) || status !== "ready") return
    sendMessage({ text: t, files: files.length > 0 ? toFileList(files) : undefined })
    setInput("")
    setFiles([])
    if (fileRef.current) fileRef.current.value = ""
  }

  const newChat = () => {
    setConversation(null)
    setMessages([])
    setInput("")
    setFiles([])
  }

  const openConvo = async (id: string) => {
    setConversation(id)
    const res = await fetch(`/api/assistant/conversations/${id}`)
    if (!res.ok) return
    const j = (await res.json()) as { messages: { id: string; role: string; content: string }[] }
    setMessages(
      j.messages.map((m) => ({
        id: m.id,
        role: m.role === "user" ? "user" : "assistant",
        parts: [{ type: "text", text: m.content }],
      }))
    )
  }

  const deleteConvo = async (id: string) => {
    await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" })
    if (conversationIdRef.current === id) newChat()
    loadConvos()
  }

  return (
    <div className="flex h-full">
      {/* 좌측: 대화 사이드바 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-muted/20 md:flex">
        <div className="p-2">
          <button
            onClick={newChat}
            className="flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <SquarePen className="size-4" /> 새 대화
          </button>
        </div>
        <p className="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Recents
        </p>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
          {convos.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">아직 대화가 없어요.</p>
          ) : (
            convos.map((c) => {
              const active = c.id === conversationId
              return (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg px-2 py-1.5",
                    active ? "bg-muted" : "hover:bg-muted/60"
                  )}
                >
                  <button
                    onClick={() => openConvo(c.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm"
                    title={c.title ?? "새 대화"}
                  >
                    {c.title || "새 대화"}
                  </button>
                  <button
                    onClick={() => deleteConvo(c.id)}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label="삭제"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </aside>

      {/* 우측: 채팅 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 모바일 새 대화(사이드바 숨김 시) */}
        <div className="flex items-center justify-end border-b px-3 py-1.5 md:hidden">
          <button onClick={newChat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <SquarePen className="size-3.5" /> 새 대화
          </button>
        </div>

        {!hasChat ? (
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4">
            <div
              aria-hidden
              className="animate-aura pointer-events-none absolute left-1/2 top-1/3 -z-10 size-[360px] -translate-x-1/2 rounded-full bg-primary/10 blur-[90px]"
            />
            <div className="animate-soft-pulse grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Sparkle className="size-5" />
            </div>
            <p className="mt-3 text-xl font-semibold tracking-tight">무엇을 도와드릴까요?</p>
            <p className="mt-1 text-sm text-muted-foreground">이큐리아 어시스턴트에게 무엇이든 물어보세요.</p>
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 [scrollbar-width:thin]">
            <div className="mx-auto max-w-3xl space-y-4">
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
                      <Sparkle className="size-3.5" />
                    </div>
                    <div className="max-w-[82%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5 text-sm leading-relaxed">
                      {messageText(m) || <span className="text-muted-foreground">생각 중…</span>}
                    </div>
                  </div>
                )
              )}
              {error && <p className="pl-9 text-xs text-destructive">오류: {error.message}</p>}
            </div>
          </div>
        )}

        {/* 입력 영역 */}
        <div className="px-4 pb-4 pt-2">
          <div className="mx-auto max-w-3xl">
            {files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-xs">
                    <Paperclip className="size-3 text-muted-foreground" />
                    <span className="max-w-[160px] truncate">{f.name}</span>
                    <button
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="첨부 제거"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 rounded-2xl border bg-card px-3 py-2.5 shadow-lg shadow-primary/5 transition-all focus-within:border-ring focus-within:shadow-primary/10 focus-within:ring-4 focus-within:ring-ring/15">
              <div className="relative shrink-0">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="추가"
                  className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Plus className="size-5" />
                </button>
                {menuOpen && (
                  <>
                    <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenuOpen(false)} />
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-56 overflow-hidden rounded-xl border bg-popover p-1 shadow-lg">
                      <MenuItem
                        icon={<Paperclip className="size-4" />}
                        label="파일·사진 첨부"
                        onClick={() => {
                          setMenuOpen(false)
                          fileRef.current?.click()
                        }}
                      />
                      <div className="my-1 h-px bg-border" />
                      <MenuItem icon={<Globe className="size-4" />} label="웹 검색" soon />
                      <MenuItem icon={<Plug className="size-4" />} label="MCP 도구" soon />
                    </div>
                  </>
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.txt,.md,.csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
                }}
              />

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // 한글 등 IME 조합 중 Enter는 무시(마지막 글자 잔류 버그 방지)
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder="무엇이든 물어보세요…"
                rows={1}
                className="max-h-40 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
              />

              <button
                onClick={submit}
                disabled={status !== "ready" || (!input.trim() && files.length === 0)}
                aria-label="전송"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
              >
                {status === "streaming" ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  soon,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  soon?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={soon}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1">{label}</span>
      {soon && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">곧</span>}
    </button>
  )
}

/** File[] → FileList (useChat sendMessage files 인자용). */
function toFileList(files: File[]): FileList {
  const dt = new DataTransfer()
  for (const f of files) dt.items.add(f)
  return dt.files
}
