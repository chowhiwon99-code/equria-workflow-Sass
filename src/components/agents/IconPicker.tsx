"use client"

import { useCallback, useRef, useState } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { AGENT_ICONS } from "@/lib/agents"
import { renderAgentIcon } from "@/components/agents/AgentIcon"

/**
 * 애플워치식 벌집(honeycomb) 아이콘 피커.
 * - 버블을 오프셋 행으로 군집 배치. 크기가 불규칙(sizeFactor)하고 상시 부드럽게 호흡(equria-bubble 애니, 버블별 delay).
 * - 커서에 가까운 버블이 물방울처럼 추가로 커짐(fisheye, 안쪽 버튼 transform). 두 모션은 중첩 transform(외:호흡 / 내:fisheye).
 * - 위치는 해석적 계산(DOM 측정 X). 저장값(value)은 "lucide:Name"(renderAgentIcon 렌더).
 * - 접근성: role=radiogroup + roving tabindex(←/→/Enter). prefers-reduced-motion: 모션 비활성.
 */

const B = 46 // 기준 버블 지름
const PITCH_X = 62 // 가로 중심 간격
const PITCH_Y = 54 // 세로 중심 간격
const PAD = 22 // 스케일된 가장자리 버블 여유
const RADIUS = 140 // fisheye 영향 반경(px)
const MAX_BOOST = 0.42 // 커서 근접 최대 확대

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

/** 인덱스별 불규칙 기준 크기 배율(0.8~1.12, 황금비 스프레드). */
function sizeFactor(idx: number): number {
  const t = (idx * 0.6180339887) % 1
  return 0.8 + t * 0.32
}

type Bubble = { idx: number; cx: number; cy: number; size: number }

function layout(): { bubbles: Bubble[]; width: number; height: number } {
  const rows = buildRows(AGENT_ICONS.length)
  const maxN = Math.max(...rows)
  const width = PAD * 2 + (maxN - 1) * PITCH_X + B
  const height = PAD * 2 + (rows.length - 1) * PITCH_Y + B
  const bubbles: Bubble[] = []
  let idx = 0
  rows.forEach((n, r) => {
    const rowW = (n - 1) * PITCH_X
    const startX = PAD + B / 2 + ((maxN - 1) * PITCH_X - rowW) / 2 // 각 행 가운데 정렬(5행은 자연히 오프셋)
    const cy = PAD + B / 2 + r * PITCH_Y
    for (let c = 0; c < n; c++) {
      bubbles.push({ idx, cx: startX + c * PITCH_X, cy, size: B * sizeFactor(idx) })
      idx++
    }
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

  const fisheyeAt = (cx: number, cy: number): number => {
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
        {BUBBLES.map(({ idx, cx, cy, size }) => {
          const item = AGENT_ICONS[idx]
          const selected = item.value === value
          const fish = fisheyeAt(cx, cy)
          const dur = 3.2 + (idx % 5) * 0.35 // 3.2~4.6s
          return (
            <div
              key={item.value}
              // 외곽: 위치+기준크기+상시 호흡(transform scale) + fisheye에 따른 z-index
              style={{
                position: "absolute",
                left: cx - size / 2,
                top: cy - size / 2,
                width: size,
                height: size,
                zIndex: Math.round(fish * 10),
                animation: reduced ? undefined : `equria-bubble ${dur}s ease-in-out ${-(idx * 0.43)}s infinite`,
              }}
            >
              <button
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
                // 안쪽: 커서 fisheye(transform scale) — 외곽 호흡과 중첩
                style={{ transform: `scale(${fish})` }}
                className={cn(
                  "grid size-full place-items-center rounded-full border outline-none transition-transform duration-200 ease-out will-change-transform focus-visible:ring-2 focus-visible:ring-ring",
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
