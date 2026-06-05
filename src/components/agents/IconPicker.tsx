"use client"

import { useCallback, useRef } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { AGENT_ICONS, type AgentIcon } from "@/lib/agents"
import { renderAgentIcon } from "@/components/agents/AgentIcon"

/**
 * 회전초밥식 아이콘 피커.
 * - 회전초밥처럼 끊김 없이 계속 흘러간다(멈추지 않음). 클릭/방향키로 선택(움직이는 중에도 클릭 가능).
 * - 접근성: role="radiogroup" + roving tabindex(←/→/Home/End/Enter).
 * - prefers-reduced-motion: 흐름을 끄고 줄바꿈 그리드로 폴백.
 * - 렌더는 renderAgentIcon(lucide). AgentIcon.image 가 있으면 <img> 우선.
 * 저장값(value)은 "lucide:Name". 기존 이모지 저장값도 렌더러가 폴백 처리(하위호환).
 */
export function IconPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (emoji: string) => void
}) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIdx = Math.max(
    0,
    AGENT_ICONS.findIndex((i) => i.value === value)
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
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
      const btn = itemRefs.current[next]
      btn?.focus()
      btn?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" })
    },
    [onChange]
  )

  const renderBtn = (it: AgentIcon, idx: number, clone: boolean) => {
    const selected = it.value === value
    return (
      <button
        key={`${clone ? "c" : "r"}${idx}`}
        ref={clone ? undefined : (el) => { itemRefs.current[idx] = el }}
        type="button"
        role={clone ? "presentation" : "radio"}
        aria-checked={clone ? undefined : selected}
        aria-hidden={clone || undefined}
        aria-label={clone ? undefined : `아이콘 ${it.label}`}
        tabIndex={clone ? -1 : idx === selectedIdx ? 0 : -1}
        onClick={() => onChange(it.value)}
        onKeyDown={clone ? undefined : (e) => onKeyDown(e, idx)}
        className={cn(
          "relative grid size-14 shrink-0 place-items-center rounded-2xl border outline-none transition-all duration-200",
          "hover:-translate-y-0.5 hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
          selected
            ? "scale-110 border-primary bg-primary/10 shadow-lg shadow-primary/20 ring-2 ring-primary"
            : "border-transparent bg-card hover:bg-accent"
        )}
      >
        {it.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.image} alt="" className="size-8 object-contain" />
        ) : (
          renderAgentIcon(it.value, "size-7")
        )}
        {selected && !clone && (
          <Check className="absolute -right-1 -top-1 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" />
        )}
      </button>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label="에이전트 아이콘 선택"
      className="group/rail relative overflow-hidden rounded-2xl border bg-muted/30 py-4"
    >
      {/* 양끝 페이드 */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent motion-reduce:hidden" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent motion-reduce:hidden" />

      <div className="flex w-max motion-safe:animate-[equria-marquee_34s_linear_infinite] motion-reduce:w-full motion-reduce:animate-none">
        {/* 실제 라디오 그룹 */}
        <div className="flex shrink-0 gap-3 pr-3 motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-2">
          {AGENT_ICONS.map((it, i) => renderBtn(it, i, false))}
        </div>
        {/* 끊김 없는 루프를 위한 복제(스크린리더에는 숨김) */}
        <div aria-hidden className="flex shrink-0 gap-3 pr-3 motion-reduce:hidden">
          {AGENT_ICONS.map((it, i) => renderBtn(it, i, true))}
        </div>
      </div>
    </div>
  )
}
