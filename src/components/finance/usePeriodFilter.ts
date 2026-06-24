"use client"

import { useMemo, useState } from "react"
import { type YM, currentYM, monthRange } from "@/components/shared/MonthStepper"

export type PeriodMode = "month" | "last" | "year" | "all"
export type DateRange = { start: string; end: string } | null

/** 이전 달(전월대비 증감% 비교군용). */
export function prevMonth({ y, m }: YM): YM {
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
}

/**
 * 기간 필터 — ym·mode 상태와 {start,end}|null 경계 계산을 한곳에 캡슐화.
 * load()·exportCsv()가 같은 경계를 공유해 중복 산출을 막는다. all 모드는 null(날짜필터 생략 = 기존 '전체' 동작).
 */
export function usePeriodFilter(defaultMode: PeriodMode = "all") {
  const [ym, setYm] = useState<YM>(currentYM)
  const [mode, setMode] = useState<PeriodMode>(defaultMode)

  const range = useMemo<DateRange>(() => {
    if (mode === "all") return null
    if (mode === "year") return { start: `${ym.y}-01-01`, end: `${ym.y + 1}-01-01` }
    return monthRange(mode === "last" ? prevMonth(ym) : ym)
  }, [ym, mode])

  return { ym, setYm, mode, setMode, range }
}
