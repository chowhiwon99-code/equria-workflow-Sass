"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ArrowUp, ArrowLeft, X, Plus, Maximize2, Minimize2, Copy, Check, Sparkles, SlidersHorizontal, Wrench, Brain, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { renderAgentIcon } from "@/components/agents/AgentIcon"
import { useAgentChat, type Agent, type WidgetPosition } from "./AgentChatContext"
import { AgentMemoryPanel } from "./AgentMemoryPanel"
import { MEMORY_KINDS, MEMORY_KIND_LABEL, isMemoryKind, type AgentMemoryKind } from "@/lib/agentMemory"

const WIDGET_SIZE = 56 // size-14
const EDGE_PADDING = 8
const DEFAULT_MARGIN = 24 // CSS bottom-6 right-6

const PANEL_SIZE_NORMAL = { width: 440, height: 620 }
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
  const [view, setView] = useState<"menu" | "chat">("menu")
  // 채팅 열기 morph(FLIP)의 출발 rect — 클릭한 에이전트 버블의 화면 좌표/크기
  const [morphRect, setMorphRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

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

  const selected = ctx.agents.find((a) => a.id === ctx.selectedAgentId) ?? ctx.agents[0]

  // 닫힘 → FAB 런처 / 열림 → 에이전트 스택 메뉴 또는 선택된 에이전트 채팅
  if (!ctx.isOpen) {
    return (
      <FabLauncher
        unread={ctx.unread}
        onOpen={() => {
          setView("menu")
          ctx.open()
        }}
      />
    )
  }
  if (view === "chat" && selected) {
    return <ChatPanel agent={selected} onBack={() => setView("menu")} morphRect={morphRect} />
  }
  return (
    <AgentFabMenu
      onPick={(id, rect) => {
        setMorphRect(rect)
        ctx.setSelectedAgent(id)
        setView("chat")
      }}
    />
  )
}

/**
 * 핀한 에이전트가 없을 때의 빈 상태.
 * 닫혀 있으면 런처 버튼, 열면 같은 우하단 위치에 안내 + "에이전트 추가하기" CTA.
 */
function EmptyAgentWidget() {
  const { isOpen, toggle, close, position, setPosition } = useAgentChat()
  // 빈 상태 런처도 드래그 가능해야 함(FabLauncher와 동일) — 예전엔 onClick만 있어 못 움직였다.
  const { handlePointerDown, wasDraggedRef, dragging } = useDragWidget({
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    onTap: toggle,
  })
  const tl = widgetTopLeft(position)

  if (!isOpen) {
    return (
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onClick={(e) => {
          if (wasDraggedRef.current) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        onDoubleClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setPosition(null)
        }}
        style={{ position: "fixed", left: tl.left, top: tl.top, touchAction: "none" }}
        className={cn(
          "z-50 flex size-14 items-center justify-center rounded-full border border-white/15 bg-primary/85 text-primary-foreground shadow-[var(--shadow-lg)] backdrop-blur-xl transition-transform",
          dragging ? "cursor-grabbing" : "cursor-grab",
          !dragging && "hover:scale-110"
        )}
        aria-label="에이전트 위젯 열기 (⌘K)"
        title="핀한 에이전트가 없습니다 (⌘K)"
      >
        <span
          className={cn(
            "pointer-events-none flex items-center justify-center",
            !dragging && "motion-safe:animate-float"
          )}
        >
          <Sparkles className="size-6" />
        </span>
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

function FabLauncher({ unread, onOpen }: { unread: boolean; onOpen: () => void }) {
  const { position, setPosition, agents, unreadAgentId } = useAgentChat()
  const { handlePointerDown, wasDraggedRef, dragging } = useDragWidget({
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    onTap: onOpen,
  })
  const tl = widgetTopLeft(position)
  const unreadAgent = unread ? agents.find((a) => a.id === unreadAgentId) : undefined

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onClick={(e) => {
        if (wasDraggedRef.current) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onDoubleClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setPosition(null)
      }}
      style={{ position: "fixed", left: tl.left, top: tl.top, touchAction: "none" }}
      className={cn(
        "z-50 flex size-14 items-center justify-center rounded-full border border-white/15 bg-primary/85 text-primary-foreground shadow-[var(--shadow-lg)] backdrop-blur-xl transition-transform",
        dragging ? "cursor-grabbing" : "cursor-grab",
        !dragging && "hover:scale-110"
      )}
      aria-label="에이전트 위젯 열기 (⌘K)"
      title={unreadAgent ? `${unreadAgent.name} · 새 메시지` : "에이전트 (⌘K)"}
    >
      {/* 아이콘만 둥둥(float) — 버튼 자체는 left/top(드래그)·hover:scale 담당이라
          transform 충돌을 피하려 안쪽 span에만 애니. 드래그 중엔 정지. */}
      <span
        className={cn(
          "pointer-events-none flex items-center justify-center",
          !dragging && "motion-safe:animate-float"
        )}
      >
        {unreadAgent ? renderAgentIcon(unreadAgent.icon, "size-6") : <Sparkles className="size-6" />}
      </span>
      {unread && (
        <span className="pointer-events-none absolute right-0 top-0 size-3 rounded-full bg-destructive ring-2 ring-background" />
      )}
      {/* 누가 보냈는지 — 이름 배지(런처 왼쪽) */}
      {unreadAgent && (
        <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-foreground shadow-[var(--shadow-md)] motion-safe:animate-fade-up">
          {unreadAgent.name}
        </span>
      )}
    </button>
  )
}

/**
 * 에이전트 FAB 스택 메뉴 — 런처 위로 핀한 에이전트들이 둥근 사선 호를 그리며 촤르륵 펼쳐진다(라벨+아이콘).
 * 위로 갈수록 화면 안쪽(우하단 기준 좌측)으로 가속하며 휘고, 라벨은 살짝 기운다.
 * 에이전트 클릭 → 채팅. 위젯에 띄울 에이전트의 추가/제거/수정은 "에이전트 관리"(/agents)에서 한다.
 * 맨 아래 FAB는 닫기(X) + 드래그 이동.
 */
function AgentFabMenu({ onPick }: { onPick: (id: string, rect: { x: number; y: number; w: number; h: number }) => void }) {
  const { agents, close, position, setPosition } = useAgentChat()
  // 닫힘 = 열림과 동일하게 스태거 애니(equria-pop-out 역재생) 후 실제 close. reduced면 즉시.
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const [closing, setClosing] = useState(false)
  const outDone = useRef(0)
  const rowCount = agents.length + 1 // 에이전트들 + "에이전트 관리" 행
  const requestClose = () => {
    if (reduced) close()
    else setClosing(true)
  }
  // 마지막 행의 닫힘 애니까지 끝나면 실제 close (in 애니 'equria-pop'은 무시)
  const onRowsAnimEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
    if (!closing || e.animationName !== "equria-pop-out") return
    outDone.current += 1
    if (outDone.current >= rowCount) close()
  }
  const { handlePointerDown, wasDraggedRef, dragging } = useDragWidget({
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    onTap: requestClose,
  })
  const tl = widgetTopLeft(position)
  const right = (typeof window !== "undefined" ? window.innerWidth : 1280) - (tl.left + WIDGET_SIZE)
  const bottom = (typeof window !== "undefined" ? window.innerHeight : 800) - (tl.top + WIDGET_SIZE)

  // 둥근 사선 호: 아래(0)→위로 갈수록 좌측 오프셋이 가속(power>1)하며 휘어진다(상한 60px).
  // base +4 → 맨 아래 아이콘(size-12)이 FAB(size-14) 위에 중앙 정렬.
  const arc = (i: number) => 4 + Math.min(60, Math.round(7 * Math.pow(i, 1.5)))
  // 라벨 기울기 — 위로 갈수록 살짝 더 기운다(레퍼런스 느낌, 상한 8°). 애니메이션 없는 span에만 적용.
  const tilt = (i: number) => -Math.min(8, i * 1.5)
  const POP = "motion-safe:animate-[equria-pop_0.34s_cubic-bezier(0.34,1.5,0.6,1)_both]"
  // 행 스타일: 닫힘이면 inline animation(pop-out, 역스태거: 위쪽이 먼저)이 POP 클래스를 덮어쓴다.
  const rowStyle = (idx: number): React.CSSProperties =>
    closing
      ? {
          marginRight: arc(idx),
          animation: `equria-pop-out 0.24s cubic-bezier(0.4,0,0.7,1) ${((agents.length - idx) * 0.04).toFixed(3)}s both`,
          pointerEvents: "none",
        }
      : { marginRight: arc(idx), animationDelay: `${idx * 0.045}s` }

  return (
    <div
      onAnimationEnd={onRowsAnimEnd}
      style={{ position: "fixed", right: clamp(right, EDGE_PADDING, 4000), bottom: clamp(bottom, EDGE_PADDING, 4000) }}
      className="z-50 flex flex-col-reverse items-end gap-4"
    >
      {/* 맨 아래: FAB(X) — 드래그로 이동, 탭하면 닫기 */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onClick={(e) => {
          if (wasDraggedRef.current) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        onDoubleClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setPosition(null)
        }}
        style={{ touchAction: "none" }}
        className={cn(
          "flex size-14 items-center justify-center rounded-full border border-white/15 bg-primary/85 text-primary-foreground shadow-[var(--shadow-lg)] backdrop-blur-xl transition-transform hover:scale-105",
          dragging ? "cursor-grabbing" : "cursor-grab"
        )}
        aria-label="닫기"
        title="닫기"
      >
        <X className="pointer-events-none size-6" />
      </button>

      {/* 에이전트 스택 — 둥근 사선으로 스태거 등장. 클릭하면 채팅 */}
      {agents.map((a, i) => (
        <div
          key={a.id}
          className={cn("flex items-center gap-2.5", POP)}
          style={rowStyle(i)}
        >
          <span
            className="rounded-xl border bg-card px-2.5 py-1 text-sm font-medium shadow-[var(--shadow-sm)]"
            style={{ transform: `rotate(${tilt(i)}deg)` }}
          >
            {a.name}
          </span>
          <button
            type="button"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              onPick(a.id, { x: r.left, y: r.top, w: r.width, h: r.height })
            }}
            className="grid size-12 place-items-center rounded-full border bg-card text-foreground shadow-[var(--shadow-md)] transition-transform hover:scale-110"
            title={a.name}
            aria-label={`${a.name} 채팅 열기`}
          >
            {renderAgentIcon(a.icon, "size-5")}
          </button>
        </div>
      ))}

      {/* 맨 위: 에이전트 관리 — 추가/제거/수정은 관리 페이지(/agents)에서 */}
      <Link
        href="/agents"
        onClick={close}
        className={cn("flex items-center gap-2.5", POP)}
        style={rowStyle(agents.length)}
        title="에이전트 관리"
        aria-label="에이전트 관리 페이지로 이동"
      >
        <span
          className="rounded-xl border bg-card px-2.5 py-1 text-sm font-medium text-muted-foreground shadow-[var(--shadow-sm)]"
          style={{ transform: `rotate(${tilt(agents.length)}deg)` }}
        >
          에이전트 관리
        </span>
        <span className="grid size-12 place-items-center rounded-full border border-dashed bg-card text-muted-foreground shadow-[var(--shadow-sm)] transition-transform hover:scale-110 hover:text-foreground">
          <SlidersHorizontal className="size-5" />
        </span>
      </Link>
    </div>
  )
}

function ChatPanel({
  agent,
  onBack,
  morphRect,
}: {
  agent: Agent
  onBack: () => void
  morphRect: { x: number; y: number; w: number; h: number } | null
}) {
  const { isExpanded, setExpanded, close, startNewConversation, chatVersionByAgent, position } =
    useAgentChat()
  // 닫힘 morph 진행 상태 — "back"=목록으로 / "close"=위젯 닫기. 애니 종료 후 실제 전환 실행.
  const [exit, setExit] = useState<null | "back" | "close">(null)

  // 좁은 화면(폰)에선 뷰포트에 맞춰 축소 — 375px 폰에서 359×(화면-16) ≈ 풀스크린. PC는 기존 크기.
  const basePanelSize = isExpanded ? PANEL_SIZE_EXPANDED : PANEL_SIZE_NORMAL
  const panelSize = {
    width: Math.min(basePanelSize.width, window.innerWidth - EDGE_PADDING * 2),
    height: Math.min(basePanelSize.height, window.innerHeight - EDGE_PADDING * 2),
  }
  const widget = widgetTopLeft(position)
  const panel = panelTopLeft(widget, panelSize)

  // FLIP morph: 버블 rect ↔ 패널 rect. transform-origin: top-left 기준 translate+scale.
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const canMorph = !!morphRect && !reduced
  // morph 애니 진행 중(in 0.36s / out 0.26s)엔 드래그·확대를 잠가, panel rect가 바뀌며
  // --morph-from이 재계산돼 생기는 잼/스케일 점프를 방지(검증 반영). 초기값=morph 재생 여부.
  const [morphing, setMorphing] = useState(canMorph)
  const morphFrom = morphRect
    ? `translate(${Math.round(morphRect.x - panel.left)}px, ${Math.round(morphRect.y - panel.top)}px) scale(${(morphRect.w / panelSize.width).toFixed(4)}, ${(morphRect.h / panelSize.height).toFixed(4)})`
    : undefined

  // 풀스크린 모드 + morph 진행 중엔 헤더 드래그 비활성
  const headerDrag = useDragWidget({ width: WIDGET_SIZE, height: WIDGET_SIZE, enabled: !isExpanded && !morphing })

  const chatKey = `${agent.id}:${chatVersionByAgent[agent.id] ?? 0}`

  // 닫기 요청 — morph 가능하면 역재생 후(onAnimationEnd) 실제 전환, 아니면 즉시.
  const requestBack = () => {
    if (canMorph) { setMorphing(true); setExit("back") } else onBack()
  }
  const requestClose = () => {
    if (canMorph) { setMorphing(true); setExit("close") } else close()
  }
  const onAnimEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    setMorphing(false) // in/out 어느 쪽이든 애니 종료 → 잠금 해제
    if (exit === "back") onBack()
    else if (exit === "close") close()
  }
  const morphStyle: React.CSSProperties = canMorph
    ? {
        transformOrigin: "top left",
        ["--morph-from" as string]: morphFrom,
        animation: exit
          ? "equria-morph-out 0.26s cubic-bezier(0.4,0,0.7,1) both"
          : "equria-morph-in 0.36s cubic-bezier(0.34,1.28,0.5,1) both",
      }
    : {}

  return (
    <div
      onAnimationEnd={onAnimEnd}
      style={{
        position: "fixed",
        left: panel.left,
        top: panel.top,
        width: panelSize.width,
        height: panelSize.height,
        touchAction: isExpanded ? "auto" : "none",
        ...morphStyle,
      }}
      className={cn(
        "z-50 flex flex-col overflow-hidden rounded-3xl border bg-card shadow-2xl",
        !canMorph && "origin-bottom-right motion-safe:animate-fade-up"
      )}
    >
      {/* 헤더 — 빈 영역 드래그로 이동. 좌측 ← 로 에이전트 목록(메뉴)로 */}
      <div
        onPointerDown={headerDrag.handlePointerDown}
        className={cn(
          "flex items-center justify-between gap-2 border-b px-2.5 py-2 select-none",
          !isExpanded && (headerDrag.dragging ? "cursor-grabbing" : "cursor-grab")
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
          <IconBtn onClick={requestBack} label="에이전트 목록">
            <ArrowLeft className="size-4" />
          </IconBtn>
          <span className="pointer-events-none shrink-0">{renderAgentIcon(agent.icon, "size-5")}</span>
          <p className="pointer-events-none truncate text-sm font-semibold">{agent.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          <IconBtn onClick={startNewConversation} label="새 대화">
            <Plus className="size-4" />
          </IconBtn>
          <IconBtn onClick={() => { if (!morphing) setExpanded(!isExpanded) }} label={isExpanded ? "줄이기" : "확대"}>
            {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </IconBtn>
          <IconBtn onClick={requestClose} label="닫기">
            <X className="size-4" />
          </IconBtn>
        </div>
      </div>

      {/* 채팅 본체 — agentId 또는 chatVersion 바뀌면 remount */}
      <ChatBody key={chatKey} agent={agent} />
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
  const { conversationIdByAgent, setConversationId, markUnread, isOpen } = useAgentChat()
  const [input, setInput] = useState("")
  const [showMem, setShowMem] = useState(false) // 기억 관리 화면 토글

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

  // '기억하기' 1회성 안내 — 첫 assistant 답변이 뜨면 한 번 보여주고, 닫으면 localStorage로 영구 숨김.
  // lazy 초기화(effect 아님)로 set-state-in-effect 회피. 초기 렌더는 messages가 비어 어차피 안 뜸 → 하이드레이션 안전.
  const [hintDismissed, setHintDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    try {
      return localStorage.getItem("equria:mem-hint") === "1"
    } catch {
      return true
    }
  })
  const dismissHint = () => {
    setHintDismissed(true)
    try {
      localStorage.setItem("equria:mem-hint", "1")
    } catch {
      /* ignore */
    }
  }
  const showMemHint = !hintDismissed && messages.some((m) => m.role === "assistant")

  // 자동 스크롤 — 첫 진입은 즉시(auto) 하단, 이후 스트리밍은 smooth.
  const scrollRef = useRef<HTMLDivElement>(null)
  const jumpToBottom = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const behavior: ScrollBehavior = jumpToBottom.current ? "auto" : "smooth"
    jumpToBottom.current = false
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [messages, status])

  // 위젯 닫힌 상태에서 새 응답 도착 → unread 표시
  const lastMessageId = messages.at(-1)?.id
  useEffect(() => {
    if (!isOpen && messages.at(-1)?.role === "assistant") markUnread(agent.id)
  }, [lastMessageId, isOpen, messages, markUnread, agent.id])

  const submit = () => {
    const text = input.trim()
    if (!text || status !== "ready") return
    sendMessage({ text })
    setInput("")
  }

  if (showMem) {
    return <AgentMemoryPanel agentId={agent.id} onClose={() => setShowMem(false)} />
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
          messages.map((m) => (
            <Bubble
              key={m.id}
              message={m}
              agentIcon={agent.icon}
              agentId={agent.id}
              conversationId={conversationIdByAgent[agent.id] ?? null}
            />
          ))
        )}
        {status === "streaming" && (
          <p className="text-xs text-muted-foreground">생각 중…</p>
        )}
        {error && <p className="text-xs text-destructive">오류: {error.message}</p>}
      </div>

      <div className="border-t bg-card p-3">
        {showMemHint && (
          <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <Brain className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span className="flex-1">
              마음에 드는 답변에 마우스를 올리면 <b className="font-medium text-foreground">기억하기</b>가 나와요. 저장해두면 다음 대화부터 반영돼요.
            </span>
            <button onClick={dismissHint} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="안내 닫기">
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <button
          onClick={() => setShowMem(true)}
          className="mb-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <Brain className="size-3.5" /> 기억 관리
        </button>
        <div className="flex items-end gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            {renderAgentIcon(agent.icon, "size-5")}
          </span>
          <div className="flex flex-1 items-end gap-1.5 rounded-3xl border bg-muted/40 py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-ring focus-within:bg-card">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="메시지 입력…"
            rows={1}
            className="max-h-32 flex-1 resize-none self-center bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
            disabled={status !== "ready"}
          />
          <button
            onClick={submit}
            disabled={status !== "ready" || !input.trim()}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
            aria-label="전송"
          >
            <ArrowUp className="size-4" />
          </button>
          </div>
        </div>
      </div>
    </>
  )
}

type MemState = "idle" | "loading" | "draft" | "saving" | "saved"

function Bubble({
  message,
  agentIcon,
  agentId,
  conversationId,
}: {
  message: UIMessage
  agentIcon: string
  agentId: string
  conversationId: string | null
}) {
  const text = message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
  // MCP 등 도구 호출 parts(tool-*/dynamic-tool)에서 도구명 추출 — "🔧 사용" 칩으로 가시화
  const toolNames = [
    ...new Set(
      message.parts
        .map((p) =>
          p.type === "dynamic-tool" ? p.toolName : p.type.startsWith("tool-") ? p.type.slice(5) : null
        )
        .filter((n): n is string => !!n)
    ),
  ]
  const isUser = message.role === "user"
  const [copied, setCopied] = useState(false)

  // 원클릭 '기억하기': AI가 한 줄 추출 → 확인·수정 → 저장(기존 memory POST). 복사·붙여넣기 없이.
  const [mem, setMem] = useState<MemState>("idle")
  const [draft, setDraft] = useState("")
  const [kind, setKind] = useState<AgentMemoryKind>("preference")

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // ignore
    }
  }

  const startRemember = async () => {
    setMem("loading")
    try {
      const res = await fetch(`/api/agents/${agentId}/memory/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { kind?: string; content?: string }
      setDraft((j.content ?? "").trim() || text.slice(0, 120))
      setKind(isMemoryKind(j.kind) ? j.kind : "preference")
    } catch {
      setDraft(text.slice(0, 120)) // 추출 실패해도 직접 다듬어 저장 가능
      setKind("preference")
    }
    setMem("draft")
  }

  const saveMem = async () => {
    const content = draft.trim()
    if (!content) return
    setMem("saving")
    try {
      const res = await fetch(`/api/agents/${agentId}/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, kind, sourceConversationId: conversationId }),
      })
      if (!res.ok) throw new Error()
      setMem("saved")
      setTimeout(() => setMem("idle"), 1600)
    } catch {
      setMem("draft") // 실패 시 다시 편집 가능
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
        {!isUser && toolNames.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {toolNames.map((n) => (
              <span
                key={n}
                className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                <Wrench className="size-3" /> {n}
              </span>
            ))}
          </div>
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{text}</p>
        ) : (
          <div className="prose prose-sm max-w-none break-words [&_*]:my-1 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
        {!isUser && text && mem === "idle" && (
          <div className="absolute -bottom-2 -right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={startRemember}
              className="flex size-6 items-center justify-center rounded-full border bg-muted text-muted-foreground hover:text-primary"
              aria-label="기억하기"
              title="기억하기 (다음 대화부터 반영)"
            >
              <Brain className="size-3" />
            </button>
            <button
              onClick={copy}
              className="flex size-6 items-center justify-center rounded-full border bg-muted text-muted-foreground hover:text-foreground"
              aria-label="복사"
              title="복사"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </button>
          </div>
        )}

        {!isUser && mem !== "idle" && (
          <div className="mt-2 rounded-xl border bg-card p-2">
            {mem === "loading" ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> 기억할 내용을 뽑는 중…
              </p>
            ) : mem === "saved" ? (
              <p className="flex items-center gap-1.5 text-xs text-primary">
                <Check className="size-3.5" /> 기억했어요
              </p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Brain className="size-3.5 text-primary" />
                  <span className="text-[11px] font-medium">이 내용을 기억할까요? (수정 가능)</span>
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg border bg-background px-2 py-1 text-xs outline-none focus:border-ring"
                />
                <div className="flex items-center gap-1.5">
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as AgentMemoryKind)}
                    className="rounded-lg border bg-background px-1.5 py-1 text-[11px] outline-none"
                    aria-label="기억 종류"
                  >
                    {MEMORY_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {MEMORY_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <div className="ml-auto flex gap-1">
                    <button
                      onClick={() => setMem("idle")}
                      className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      취소
                    </button>
                    <button
                      onClick={saveMem}
                      disabled={!draft.trim() || mem === "saving"}
                      className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {mem === "saving" ? "저장 중…" : "저장"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
