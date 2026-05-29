"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Send, X, Plus, Maximize2, Minimize2, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAgentChat, type Agent } from "./AgentChatContext"

export function FloatingAgentChat() {
  const ctx = useAgentChat()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        ctx.toggle()
      }
      if (e.key === "Escape" && ctx.isOpen) {
        ctx.close()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ctx])

  if (ctx.loading || ctx.agents.length === 0 || !ctx.selectedAgentId) return null
  const selected = ctx.agents.find((a) => a.id === ctx.selectedAgentId)
  if (!selected) return null

  return (
    <>
      {!ctx.isOpen && <FloatingButton agent={selected} unread={ctx.unread} onOpen={ctx.open} />}
      {/* 열려있어도 닫혀있어도 ChatPanel은 항상 마운트 — 메시지·입력 보존. visibility만 제어. */}
      <ChatPanel hidden={!ctx.isOpen} />
    </>
  )
}

function FloatingButton({
  agent,
  unread,
  onOpen,
}: {
  agent: Agent
  unread: boolean
  onOpen: () => void
}) {
  return (
    <button
      onClick={onOpen}
      className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-2xl text-primary-foreground shadow-xl shadow-primary/30 transition-transform hover:scale-110 animate-float"
      aria-label="에이전트 채팅 열기 (⌘K)"
      title={`${agent.name} (⌘K)`}
    >
      <span>{agent.icon}</span>
      {unread && (
        <span className="absolute right-0 top-0 size-3 rounded-full bg-red-500 ring-2 ring-background" />
      )}
    </button>
  )
}

function ChatPanel({ hidden }: { hidden: boolean }) {
  const {
    agents,
    selectedAgentId,
    isExpanded,
    setExpanded,
    close,
    setSelectedAgent,
    startNewConversation,
    chatVersionByAgent,
  } = useAgentChat()
  const selected = agents.find((a) => a.id === selectedAgentId)
  if (!selected) return null
  const chatKey = `${selected.id}:${chatVersionByAgent[selected.id] ?? 0}`

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl transition-all",
        isExpanded ? "h-[min(80vh,720px)] w-[min(80vw,720px)]" : "h-[540px] w-[380px]",
        hidden && "pointer-events-none -translate-y-2 scale-95 opacity-0"
      )}
      aria-hidden={hidden}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-2xl">{selected.icon}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{selected.name}</p>
            <p className="truncate text-xs text-muted-foreground">{selected.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconBtn onClick={startNewConversation} label="새 대화">
            <Plus className="size-4" />
          </IconBtn>
          <IconBtn
            onClick={() => setExpanded(!isExpanded)}
            label={isExpanded ? "줄이기" : "확대"}
          >
            {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </IconBtn>
          <IconBtn onClick={close} label="닫기">
            <X className="size-4" />
          </IconBtn>
        </div>
      </div>

      {/* 에이전트 가로 칩 */}
      <div className="flex gap-1 overflow-x-auto border-b bg-muted/30 px-2 py-1.5 [scrollbar-width:thin]">
        {agents.map((a) => (
          <button
            key={a.id}
            onClick={() => setSelectedAgent(a.id)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-base transition-colors",
              a.id === selectedAgentId
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
            )}
            title={a.name}
            aria-label={a.name}
            aria-pressed={a.id === selectedAgentId}
          >
            {a.icon}
          </button>
        ))}
      </div>

      {/* 채팅 본체 — agentId 바뀌거나 "새 대화" 누르면 remount해서 useChat 인스턴스·메시지 모두 리셋 */}
      <ChatBody key={chatKey} agent={selected} />
    </div>
  )
}

function IconBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  )
}

function ChatBody({ agent }: { agent: Agent }) {
  const { conversationIdByAgent, setConversationId, setUnread, isOpen } = useAgentChat()
  const [input, setInput] = useState("")

  // 매 요청마다 최신 conversationId를 보내기 위한 ref
  const conversationIdRef = useRef<string | null>(conversationIdByAgent[agent.id] ?? null)
  useEffect(() => {
    conversationIdRef.current = conversationIdByAgent[agent.id] ?? null
  }, [conversationIdByAgent, agent.id])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/agents/${agent.id}/chat`,
        body: () => ({ conversationId: conversationIdRef.current }),
        fetch: async (url, options) => {
          const res = await fetch(url, options)
          const convId = res.headers.get("X-Conversation-Id")
          if (convId && convId !== conversationIdRef.current) {
            setConversationId(agent.id, convId)
          }
          return res
        },
      }),
    [agent.id, setConversationId]
  )

  const { messages, sendMessage, status, error } = useChat({ transport })

  // 자동 스크롤
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages, status])

  // 위젯 닫힌 상태에서 새 응답 도착 → unread 표시
  const lastMessageId = messages.at(-1)?.id
  useEffect(() => {
    if (!isOpen && messages.at(-1)?.role === "assistant") setUnread(true)
  }, [lastMessageId, isOpen, messages, setUnread])

  const submit = () => {
    const text = input.trim()
    if (!text || status !== "ready") return
    sendMessage({ text })
    setInput("")
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto p-3 [scrollbar-width:thin]"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <span className="text-4xl">{agent.icon}</span>
            <p className="text-sm font-medium">{agent.name}</p>
            <p className="text-xs text-muted-foreground">{agent.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">메시지를 입력해 시작하세요.</p>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} agentIcon={agent.icon} />)
        )}
        {status === "streaming" && (
          <p className="text-xs text-muted-foreground">생각 중…</p>
        )}
        {error && <p className="text-xs text-destructive">오류: {error.message}</p>}
      </div>

      <div className="border-t bg-background p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="메시지 입력… (Enter 전송, Shift+Enter 줄바꿈)"
            rows={1}
            className="max-h-32 flex-1 resize-none rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            disabled={status !== "ready"}
          />
          <button
            onClick={submit}
            disabled={status !== "ready" || !input.trim()}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            aria-label="전송"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </>
  )
}

function Bubble({ message, agentIcon }: { message: UIMessage; agentIcon: string }) {
  const text = message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
  const isUser = message.role === "user"
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // ignore
    }
  }

  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <span className="mt-1 shrink-0 text-lg leading-none" aria-hidden>
          {agentIcon}
        </span>
      )}
      <div
        className={cn(
          "group relative max-w-[85%] rounded-2xl px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{text}</p>
        ) : (
          <div className="prose prose-sm max-w-none break-words [&_*]:my-1 [&_code]:rounded [&_code]:bg-background/60 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-background/70 [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
        {!isUser && text && (
          <button
            onClick={copy}
            className="absolute -bottom-2 -right-2 flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
            aria-label="복사"
            title="복사"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </button>
        )}
      </div>
    </div>
  )
}
