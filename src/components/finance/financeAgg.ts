import { type YM } from "@/components/shared/MonthStepper"

/** 집계 입력 행(통화 합산 방지를 위해 currency를 항상 들고 다닌다). */
export type SumRow = {
  kind: string
  category: string | null
  total_amount: number
  currency: string | null
  entry_date?: string | null
}

export type CurrencyTotals = Record<string, { revenue: number; expense: number }>

/** 통화별 매출/지출 합 — 서로 다른 통화는 절대 합산하지 않는다. */
export function aggregateByCurrency(rows: SumRow[]): CurrencyTotals {
  const out: CurrencyTotals = {}
  for (const r of rows) {
    const cur = r.currency || "KRW"
    const bc = (out[cur] ??= { revenue: 0, expense: 0 })
    const amt = Number(r.total_amount)
    if (r.kind === "revenue") bc.revenue += amt
    else bc.expense += amt
  }
  return out
}

/** 분류별 합 — KRW만(통화 혼합 방지). kind로 지출/매출 분기. */
export function aggregateByCategory(rows: SumRow[], kind: "expense" | "revenue"): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    if (r.kind !== kind) continue
    if ((r.currency || "KRW") !== "KRW") continue
    const k = r.category || "기타"
    out[k] = (out[k] ?? 0) + Number(r.total_amount)
  }
  return out
}

export type BreakdownItem = { label: string; amount: number; pct: number }

/** 정렬 + 상위 N + 나머지 '기타' 묶음 + 비중%(합계 대비). */
export function toBreakdown(record: Record<string, number>, topN = 8): BreakdownItem[] {
  const sorted = Object.entries(record)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
  const total = sorted.reduce((s, [, v]) => s + v, 0)
  if (total <= 0) return []
  const items: BreakdownItem[] = sorted
    .slice(0, topN)
    .map(([label, amount]) => ({ label, amount, pct: (amount / total) * 100 }))
  const restSum = sorted.slice(topN).reduce((s, [, v]) => s + v, 0)
  if (restSum > 0) items.push({ label: "기타", amount: restSum, pct: (restSum / total) * 100 })
  return items
}

export type TrendMonth = { label: string; ym: YM; revenue: number; expense: number }

/** 선택월 포함 직전 N개월의 매출/지출 버킷 — 단일 통화만(혼합 금지). */
export function buildMonthlyTrend(rows: SumRow[], currency: string, anchor: YM, monthsBack = 6): TrendMonth[] {
  const buckets: TrendMonth[] = []
  for (let i = monthsBack - 1; i >= 0; i--) {
    let y = anchor.y
    let m = anchor.m - i
    while (m <= 0) {
      m += 12
      y -= 1
    }
    buckets.push({ label: `${m}월`, ym: { y, m }, revenue: 0, expense: 0 })
  }
  const idx = new Map(buckets.map((b, i) => [`${b.ym.y}-${b.ym.m}`, i]))
  for (const r of rows) {
    if ((r.currency || "KRW") !== currency) continue
    if (!r.entry_date) continue
    const y = Number(r.entry_date.slice(0, 4))
    const m = Number(r.entry_date.slice(5, 7))
    const i = idx.get(`${y}-${m}`)
    if (i === undefined) continue
    const amt = Number(r.total_amount)
    if (r.kind === "revenue") buckets[i].revenue += amt
    else buckets[i].expense += amt
  }
  return buckets
}
