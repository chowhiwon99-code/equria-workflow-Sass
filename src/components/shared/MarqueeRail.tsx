"use client"

import { Children } from "react"
import { cn } from "@/lib/utils"

/**
 * 가로 무한 마퀴 레일(회전초밥). 트랙을 2벌 렌더 → -50% 이동으로 끊김 없는 루프.
 * - 멈추지 않고 계속 회전(회전초밥). 움직이는 중에도 카드의 버튼·링크 클릭 가능.
 * - 아이템이 4개 미만이면 레일을 못 채우므로 회전 없이 일반 그리드로 폴백.
 * - prefers-reduced-motion: 회전을 끄고 가로 스크롤(overflow-x-auto)로 폴백.
 * 복제본(clone)의 카드 내부 핸들러는 원본과 동일(같은 onClick) → 어느 카드를 눌러도 같은 동작.
 * (복제본은 스크린리더에 aria-hidden 으로 숨긴다.)
 */
export function MarqueeRail({
  children,
  itemClassName,
}: {
  children: React.ReactNode
  itemClassName?: string
}) {
  const items = Children.toArray(children).filter(Boolean)

  // 적은 개수는 회전이 어색하므로 기존 그리드 유지.
  if (items.length < 4) {
    return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  }

  const group = (clone: boolean) => (
    <div
      aria-hidden={clone || undefined}
      className={cn("flex shrink-0 gap-3 pr-3", clone && "motion-reduce:hidden")}
    >
      {items.map((c, i) => (
        <div key={`${clone ? "c" : "r"}${i}`} className={cn("w-[300px] shrink-0", itemClassName)}>
          {c}
        </div>
      ))}
    </div>
  )

  return (
    <div className="group/rail relative">
      {/* 양끝 페이드 */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent motion-reduce:hidden" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent motion-reduce:hidden" />

      <div className="overflow-hidden py-1 motion-reduce:overflow-x-auto">
        <div className="flex w-max motion-safe:animate-[equria-marquee_45s_linear_infinite] motion-reduce:animate-none">
          {group(false)}
          {group(true)}
        </div>
      </div>
    </div>
  )
}
