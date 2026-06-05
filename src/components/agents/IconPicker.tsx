"use client"

import { useCallback, useRef, useState } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { AGENT_ICONS } from "@/lib/agents"
import { renderAgentIcon } from "@/components/agents/AgentIcon"

/**
 * 애플워치식 벌집(honeycomb) 아이콘 피커.
 * - 버블을 오프셋 행으로 군집 배치. 커서에 가까운 버블이 물방울처럼 커지고 멀면 작아지는 fisheye 모션.
 * - 위치는 해석적으로 계산(DOM 측정 X) → 스케일은 캐시된 중심 vs 커서 거리로만. 가볍다.
 * - 저장값(value)은 "lucide:Name"(renderAgentIcon으로 렌더). 접근성: role=radiogroup + roving tabindex(←/→/Enter).
 * - prefers-reduced-motion: 모션 비활성(스케일 고정).
 */

const B = 52 // 버블 지름(scale 1)
const PITCH_X = 60 // 가로 중심 간격
const PITCH_Y = 50 // 세로 중심 간격
const PAD = 18 // 스케일된 가장자리 버블이 잘리지 않게
const RADIUS = 130 // fisheye 영향 반경(px)
const MAX_BOOST = 0.55 // 최대 확대(=1.55배)

/** 아이콘 개수를 5/6 교차 행으로 분할(벌집). */
function buildRows(total: number): number[] {
  const rows: number[] = []
  let i = 0
  let big = false
  while (i < total) {
    const n = Math.min(big ? 6 : 5, total - i)
    rows.push(n)
    i += n
    big = !big
  }
  return rows
}

type Bubble = { idx: number; cx: number; cy: number }

function layout(): { bubbles: Bubble[]; width: number; height: number } {
  const rows = buildRows(AGENT_ICONS.length)
  const maxN = Math.max(...rows)
  const width = PAD * 2 + (maxN - 1) * PITCH_X + B
  const height = PAD * 2 + (rows.length - 1) * PITCH_Y + B
  const bubbles: Bubble[] = []
  let idx = 0
  rows.forEach((n, r) => {
    const rowW = (n - 1) * PITCH_X
    const startX = PAD + B / 2 + ((maxN - 1) * PITCH_X - rowW) / 2 // 각 행을 가운데 정렬(5행은 자연히 오프셋)
    const cy = PAD + B / 2 + r * PITCH_Y
    for (let c = 0; c < n; c++) bubbles.push({ idx: idx++, cx: startX + c * PITCH_X, cy })
  })
  return { bubbles, width, height }
}

const { bubbles: BUBBLES, width: WIDTH, height: HEIGHT } = layout()

export function IconPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      if (reduced) return
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => setCursor({ x, y }))
    },
    [reduced]
  )
  const onLeave = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setCursor(null)
  }, [])

  const scaleAt = (cx: number, cy: number): number => {
    if (!cursor) return 1
    const d = Math.hypot(cx - cursor.x, cy - cursor.y)
    const boost = Math.max(0, 1 - d / RADIUS)
    return 1 + boost * boost * MAX_BOOST // 제곱 ease로 물방울 느낌
  }

  const selectedIdx = Math.max(
    0,
    AGENT_ICONS.findIndex((i) => i.value === value)
  )

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    const n = AGENT_ICONS.length
    let next = -1
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % n
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + n) % n
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = n - 1
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault()
      onChange(AGENT_ICONS[idx].value)
      return
    } else return
    e.preventDefault()
    onChange(AGENT_ICONS[next].value)
    itemRefs.current[next]?.focus()
  }

  return (
    <div className="flex justify-center rounded-2xl bg-muted/40 p-2">
      <div
        ref={containerRef}
        role="radiogroup"
        aria-label="에이전트 아이콘 선택"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="relative"
        style={{ width: WIDTH, height: HEIGHT }}
      >
        {BUBBLES.map(({ idx, cx, cy }) => {
          const item = AGENT_ICONS[idx]
          const selected = item.value === value
          const s = scaleAt(cx, cy)
          return (
            <button
              key={item.value}
              ref={(el) => {
                itemRefs.current[idx] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`아이콘 ${item.label}`}
              tabIndex={idx === selectedIdx ? 0 : -1}
              onClick={() => onChange(item.value)}
              onKeyDown={(e) => onKeyDown(e, idx)}
              style={{
                left: cx - B / 2,
                top: cy - B / 2,
                width: B,
                height: B,
                transform: `scale(${s})`,
                zIndex: Math.round(s * 10),
              }}
              className={cn(
                "absolute grid place-items-center rounded-full border outline-none transition-transform duration-200 ease-out will-change-transform focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary/10 text-primary ring-2 ring-primary"
                  : "border-transparent bg-card text-foreground shadow-[var(--shadow-sm)] hover:bg-accent"
              )}
            >
              {renderAgentIcon(item.value, "size-5")}
              {selected && (
                <Check className="absolute -right-0.5 -top-0.5 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
