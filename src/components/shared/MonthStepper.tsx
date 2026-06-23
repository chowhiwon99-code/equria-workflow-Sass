"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

export type YM = { y: number; m: number }

/** 오늘 기준 연/월(1-12). */
export function currentYM(): YM {
  const d = new Date()
  return { y: d.getFullYear(), m: d.getMonth() + 1 }
}

/** 선택 월의 [시작, 다음달 시작) 범위(YYYY-MM-DD) — work_date를 gte start · lt end로 거른다. */
export function monthRange({ y, m }: YM): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0")
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return { start: `${y}-${pad(m)}-01`, end: `${ny}-${pad(nm)}-01` }
}

/** 월 이동 스텝퍼(◀ 2026년 6월 ▶). max 지정 시 그 달 이후로는 못 넘어감(미래 차단). */
export function MonthStepper({ value, onChange, max }: { value: YM; onChange: (ym: YM) => void; max?: YM }) {
  const { y, m } = value
  const prev = () => onChange(m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 })
  const next = () => onChange(m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 })
  const atMax = max ? y > max.y || (y === max.y && m >= max.m) : false
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={prev}
        aria-label="이전 달"
        className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-[5.25rem] text-center text-sm font-medium tabular-nums">
        {y}년 {m}월
      </span>
      <button
        onClick={next}
        disabled={atMax}
        aria-label="다음 달"
        className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
