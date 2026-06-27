import type { CashAccount } from "@/types"

// 현금흐름 순수 모델 — 슬롯(돈 항목) → 좌→우 파이프라인 그래프 + 통화별 요약(렌더/DB 무관).
// 매출(왼쪽, 들어옴) → 회사 가용현금(가운데 풀) → 비용/보유(오른쪽, 나감).

export type CashNode = {
  id: string // 슬롯 id, 또는 풀 "pool"
  label: string
  kind: string // 슬롯 kind, 또는 "pool"
  currency: string
  color: string
  x: number | null
  y: number | null
  synthetic: boolean // true = 풀(드래그 안 함)
  balance: number // 슬롯=금액, 풀=가용현금
  inflow: number
  outflow: number
  // 풀 전용 분해
  opening?: number
  revenue?: number
  expense?: number
  reserve?: number
  netProfit?: number
}

export type CashEdge = {
  id: string
  source: string // 돈이 나가는 노드
  target: string // 돈이 들어오는 노드
  amount: number
  currency: string
  kind: "revenue" | "expense" | "reserve"
}

export type CashSummary = {
  currency: string
  opening: number
  revenue: number
  expense: number
  reserve: number
  available: number // = opening + revenue − expense − reserve
  netProfit: number // = revenue − expense
}

const n = (v: number | string | null | undefined): number => Number(v ?? 0)

// 슬롯 구분 — 매출(income)/비용(expense)/보유(hold).
export const SLOT_INCOME_KIND = "revenue_src"
export const SLOT_HOLD_KIND = "reserve"
export function slotCategory(kind: string): "income" | "expense" | "hold" {
  if (kind === SLOT_INCOME_KIND) return "income"
  if (kind === SLOT_HOLD_KIND) return "hold"
  return "expense"
}

export const POOL_ID = "pool"

/**
 * 슬롯 + 시작 보유현금 → 흐름 그래프 + 통화별 요약.
 * 가용현금 = 시작 보유현금 + Σ매출 − Σ비용 − Σ보유 · 순이익 = Σ매출 − Σ비용 (통화별 분리).
 */
export function buildSlotGraph(
  slots: CashAccount[],
  opening: Record<string, number> = {},
  defaultCurrency = "KRW"
): { nodes: CashNode[]; edges: CashEdge[]; summary: CashSummary[]; pool: CashSummary } {
  const agg = new Map<string, { revenue: number; expense: number; reserve: number }>()
  const curCount = new Map<string, number>()
  const ensure = (c: string) => {
    let a = agg.get(c)
    if (!a) {
      a = { revenue: 0, expense: 0, reserve: 0 }
      agg.set(c, a)
    }
    return a
  }
  for (const s of slots) {
    const cat = slotCategory(s.kind)
    const a = ensure(s.currency)
    if (cat === "income") a.revenue += n(s.amount)
    else if (cat === "hold") a.reserve += n(s.amount)
    else a.expense += n(s.amount)
    curCount.set(s.currency, (curCount.get(s.currency) ?? 0) + 1)
  }
  for (const c of Object.keys(opening)) ensure(c)

  const summary: CashSummary[] = [...agg.entries()].map(([currency, a]) => {
    const op = n(opening[currency])
    return {
      currency,
      opening: op,
      revenue: a.revenue,
      expense: a.expense,
      reserve: a.reserve,
      available: op + a.revenue - a.expense - a.reserve,
      netProfit: a.revenue - a.expense,
    }
  })

  // 풀 통화 = 가장 많은 슬롯 통화, 없으면 기본 통화
  let poolCur = defaultCurrency
  let best = -1
  for (const [c, cnt] of curCount) if (cnt > best) { best = cnt; poolCur = c }
  ensure(poolCur)
  const pool = summary.find((s) => s.currency === poolCur) ?? {
    currency: poolCur, opening: n(opening[poolCur]), revenue: 0, expense: 0, reserve: 0, available: n(opening[poolCur]), netProfit: 0,
  }

  // 레이아웃 — 매출 왼쪽 / 풀 가운데 / 비용·보유 오른쪽
  const counts = { income: 0, expense: 0, hold: 0 }
  const slotNodes: CashNode[] = slots.map((s) => {
    const cat = slotCategory(s.kind)
    let pos: { x: number; y: number }
    if (s.x != null && s.y != null) pos = { x: n(s.x), y: n(s.y) }
    else if (cat === "income") pos = { x: 40, y: 40 + counts.income++ * 92 }
    else if (cat === "expense") pos = { x: 720, y: 40 + counts.expense++ * 92 }
    else pos = { x: 720, y: 380 + counts.hold++ * 92 }
    return {
      id: s.id, label: s.name, kind: s.kind, currency: s.currency, color: s.color,
      x: pos.x, y: pos.y, synthetic: false, balance: n(s.amount), inflow: 0, outflow: 0,
    }
  })

  const poolNode: CashNode = {
    id: POOL_ID, label: "회사 가용 현금", kind: "pool", currency: poolCur, color: "blue",
    x: 380, y: 190, synthetic: true, balance: pool.available, inflow: 0, outflow: 0,
    opening: pool.opening, revenue: pool.revenue, expense: pool.expense, reserve: pool.reserve, netProfit: pool.netProfit,
  }

  const edges: CashEdge[] = []
  for (const s of slots) {
    const amt = n(s.amount)
    if (amt === 0) continue
    const cat = slotCategory(s.kind)
    if (cat === "income") edges.push({ id: `in:${s.id}`, source: s.id, target: POOL_ID, amount: amt, currency: s.currency, kind: "revenue" })
    else if (cat === "expense") edges.push({ id: `ex:${s.id}`, source: POOL_ID, target: s.id, amount: amt, currency: s.currency, kind: "expense" })
    else edges.push({ id: `ho:${s.id}`, source: POOL_ID, target: s.id, amount: amt, currency: s.currency, kind: "reserve" })
  }

  return { nodes: [poolNode, ...slotNodes], edges, summary, pool }
}
