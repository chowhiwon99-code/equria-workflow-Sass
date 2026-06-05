"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Send, X, Plus, Maximize2, Minimize2, Copy, Check, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { renderAgentIcon } from "@/components/agents/AgentIcon"
import { useAgentChat, type Agent, type WidgetPosition } from "./AgentChatContext"

const WIDGET_SIZE = 56 // size-14
const EDGE_PADDING = 8
const DEFAULT_MARGIN = 24 // CSS bottom-6 right-6

const PANEL_SIZE_NORMAL = { width: 380, height: 540 }
const PANEL_SIZE_EXPANDED = { width: 720, height: 720 }

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/**
 * 위젯(또는 패널 헤더) 드래그 훅.
 * - 5px 이내 이동은 "탭"으로 간주해 onTap 호출
 * - 5px 초과 이동은 드래그 — position 업데이트 + 다음 click 1회 차단
 */
function useDragWidget(opts: {
  width: number
  height: number
  enabled?: boolean
  onTap?: () => void
}) {
  const { position, setPosition } = useAgentChat()
  const wasDraggedRef = useRef(false)
  const [dragging, setDragging] = useState(false)

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (opts.enabled === false) return
    if (e.pointerType === "mouse" && e.button !== 0) return

    const target = e.currentTarget
    target.setPointerCapture?.(e.pointerId)
    const rect = target.getBoundingClientRect()

    const startX = e.clientX
    const startY = e.clientY
    // 현재 좌상단 좌표 — position이 없으면 실제 element 위치 사용
    const startPosX = position?.x ?? rect.left
    const startPosY = position?.y ?? rect.top

    let moved = false

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!moved) {
        if (Math.hypot(dx, dy) < 5) return
        moved = true
        wasDraggedRef.current = true
        setDragging(true)
      }
      const x = clamp(startPosX + dx, EDGE_PADDING, window.innerWidth - opts.width - EDGE_PADDING)
      const y = clamp(startPosY + dy, EDGE_PADDING, window.innerHeight - opts.height - EDGE_PADDING)
      setPosition({ x, y })
    }

    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      setDragging(false)
      if (!moved && opts.onTap) opts.onTap()
      // click 이벤트는 pointerup 직후 발생 — 다음 한 번만 막기
      if (moved) {
        setTimeout(() => {
          wasDraggedRef.current = false
        }, 0)
      } else {
        wasDraggedRef.current = false
      }
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }

  return { handlePointerDown, wasDraggedRef, dragging }
}

/** 위젯 닫힌 상태일 때 좌상단 좌표 — position 없으면 우하단 기본값 */
function widgetTopLeft(position: WidgetPosition | null): { left: number; top: number } {
  if (typeof window === "undefined" || !position) {
    return {
      left:
        (typeof window !== "undefined" ? window.innerWidth : 1280) -
        WIDGET_SIZE -
        DEFAULT_MARGIN,
      top:
        (typeof window !== "undefined" ? window.innerHeight : 800) -
        WIDGET_SIZE -
        DEFAULT_MARGIN,
    }
  }
  return { left: position.x, top: position.y }
}

/** 패널 위치 = 위젯의 우하단 코너를 패널의 우하단 코너로 정렬 + 화면 clamp */
function panelTopLeft(
  widget: { left: number; top: number },
  panel: { width: number; height: number }
): { left: number; top: number } {
  if (typeof window === "undefined") return { left: widget.left, top: widget.top }
  const widgetRight = widget.left + WIDGET_SIZE
  const widgetBottom = widget.top + WIDGET_SIZE
  const left = clamp(
    widgetRight - panel.width,
    EDGE_PADDING,
    window.innerWidth - panel.width - EDGE_PADDING
  )
  const top = clamp(
    widgetBottom - panel.height,
    EDGE_PADDING,
    window.innerHeight - panel.height - EDGE_PADDING
  )
  return { left, top }
}

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

  // 화면 resize 시 위젯이 화면 밖으로 빠지면 안으로 끌어들임
  useEffect(() => {
    if (!ctx.position) return
    function onResize() {
      if (!ctx.position) return
      const x = clamp(ctx.position.x, EDGE_PADDING, window.innerWidth - WIDGET_SIZE - EDGE_PADDING)
      const y = clamp(ctx.position.y, EDGE_PADDING, window.innerHeight - WIDGET_SIZE - EDGE_PADDING)
      if (x !== ctx.position.x || y !== ctx.position.y) ctx.setPosition({ x, y })
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [ctx])

  // 로딩 중에는 아무것도 그리지 않는다.
  if (ctx.loading) return null
  // 핀한 에이전트가 0개 → 위젯을 숨기지 않고 같은 우하단에 빈 상태를 띄운다.
  if (ctx.agents.length === 0) return <EmptyAgentWidget />

  const selected = ctx.agents.find((a) => a.id === ctx.selectedAgentId)
  if (!selected) return null

  return (
    <>
      {!ctx.isOpen && <FloatingButton agent={selected} unread={ctx.unread} />}
      <ChatPanel hidden={!ctx.isOpen} />
    </>
  )
}

/**
 * 핀한 에이전트가 없을 때의 빈 상태.
 * 닫혀 있으면 런처 버튼, 열면 같은 우하단 위치에 안내 + "에이전트 추가하기" CTA.
 */
function EmptyAgentWidget() {
  const { isOpen, toggle, close, position } = useAgentChat()
  const tl = widgetTopLeft(position)

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={toggle}
        style={{ position: "fixed", left: tl.left, top: tl.top }}
        className={cn(
          "z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 transition-shadow",
          "animate-float hover:scale-110"
        )}
        aria-label="에이전트 위젯 열기 (⌘K)"
        title="핀한 에이전트가 없습니다 (⌘K)"
      >
        <Sparkles className="pointer-events-none size-6" />
      </button>
    )
  }

  // 위젯의 우하단 코너를 빈-상태 패널 우하단 코너에 맞춰 정렬 (loading 이후라 window 항상 존재)
  const vw = window.innerWidth
  const vh = window.innerHeight
  const panelWidth = 288 // w-72
  const right = vw - (tl.left + WIDGET_SIZE)
  const bottom = vh - (tl.top + WIDGET_SIZE)

  return (
    <div
      style={{
        position: "fixed",
        right: clamp(right, EDGE_PADDING, vw - panelWidth - EDGE_PADDING),
        bottom: clamp(bottom, EDGE_PADDING, vh - EDGE_PADDING),
      }}
      className="z-50 flex w-72 flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-4 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-2">
        <Sparkles className="size-6 text-muted-foreground" aria-hidden />
        <button
          onClick={close}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="닫기"
          aria-label="닫기"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">핀한 에이전트가 없습니다</p>
        <p className="text-xs text-muted-foreground">
          관리 페이지에서 위젯에 띄울 에이전트를 핀하면 여기에 나타납니다.
        </p>
      </div>
      <Link
        href="/agents"
        onClick={close}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Plus className="size-4" /> 에이전트 추가하기
      </Link>
    </div>
  )
}

function FloatingButton({ agent, unread }: { agent: Agent; unread: boolean }) {
  const { open, position, setPosition } = useAgentChat()
  const { handlePointerDown, wasDraggedRef, dragging } = useDragWidget({
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    onTap: open,
  })
  const tl = widgetTopLeft(position)

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onClick={(e) => {
        // pointer-up onTap에서 이미 처리됨. 드래그 후 발생하는 합성 click은 차단.
        if (wasDraggedRef.current) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onDoubleClick={(e) => {
        // 더블클릭으로 기본 위치(우하단)로 리셋
        e.preventDefault()
        e.stopPropagation()
        setPosition(null)
      }}
      style={{
        position: "fixed",
        left: tl.left,
        top: tl.top,
        touchAction: "none",
      }}
      className={cn(
        "z-50 flex size-14 items-center justify-center rounded-full bg-primary text-2xl text-primary-foreground shadow-xl shadow-primary/30 transition-shadow",
        dragging ? "cursor-grabbing" : "cursor-grab",
        !dragging && "animate-float hover:scale-110"
      )}
      aria-label="에이전트 채팅 열기 (⌘K)"
      title={`${agent.name} (⌘K)`}
    >
      <span className="pointer-events-none">{renderAgentIcon(agent.icon, "size-6")}</span>
      {unread && (
        <span className="pointer-events-none absolute right-0 top-0 size-3 rounded-full bg-destructive ring-2 ring-background" />
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
    position,
  } = useAgentChat()
  const selected = agents.find((a) => a.id === selectedAgentId)

  const panelSize = isExpanded ? PANEL_SIZE_EXPANDED : PANEL_SIZE_NORMAL
  const widget = widgetTopLeft(position)
  const panel = panelTopLeft(widget, panelSize)

  // 풀스크린 모드에서 헤더 드래그 비활성
  const headerDrag = useDragWidget({
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    enabled: !isExpanded,
  })

  if (!selected) return null
  const chatKey = `${selected.id}:${chatVersionByAgent[selected.id] ?? 0}`

  return (
    <div
      style={{
        position: "fixed",
        left: panel.left,
        top: panel.top,
        width: panelSize.width,
        height: panelSize.height,
        touchAction: isExpanded ? "auto" : "none",
      }}
      className={cn(
        "z-50 flex flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl transition-opacity",
        hidden && "pointer-events-none opacity-0"
      )}
      aria-hidden={hidden}
    >
      {/* 헤더 — 빈 영역 드래그로 위젯 위치 이동 (expanded 시 비활성) */}
      <div
        onPointerDown={headerDrag.handlePointerDown}
        className={cn(
          "flex items-center justify-between gap-2 border-b px-3 py-2 select-none",
          !isExpanded && (headerDrag.dragging ? "cursor-grabbing" : "cursor-grab")
        )}
      >
        <div className="flex min-w-0 items-center gap-2 pointer-events-none">
          <span className="shrink-0">{renderAgentIcon(selected.icon, "size-5")}</span>
          <p className="truncate text-sm font-semibold">{selected.name}</p>
        </div>
        <div
          className="flex shrink-0 items-center gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
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
                : "text-muted-foreground hover:bg-card hover:text-foreground"
            )}
            title={a.name}
            aria-label={a.name}
            aria-pressed={a.id === selectedAgentId}
          >
            {renderAgentIcon(a.icon, "size-5")}
          </button>
        ))}
      </div>

      {/* 채팅 본체 — agentId 또는 chatVersion 바뀌면 remount */}
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
            <span className="text-4xl">{renderAgentIcon(agent.icon, "size-9")}</span>
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

      <div className="border-t bg-card p-2">
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
            className="max-h-32 flex-1 resize-none rounded-lg border bg-card px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
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
          {renderAgentIcon(agentIcon, "size-5")}
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
          <div className="prose prose-sm max-w-none break-words [&_*]:my-1 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
        {!isUser && text && (
          <button
            onClick={copy}
            className="absolute -bottom-2 -right-2 flex size-6 items-center justify-center rounded-full border bg-muted text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
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
