import type { CashAccount, CashTransfer, FinanceEntry } from "@/types"

// 현금흐름 순수 모델 — 잔액 계산·그래프 구성(렌더/DB 무관, 단위 테스트 가능). financeAgg와 같은 결.

export type Balance = { currency: string; opening: number; inflow: number; outflow: number; balance: number }

export type CashNode = {
  id: string // 계좌 id, 또는 합성 카테고리 노드 "cat:revenue:쿠팡"
  label: string
  kind: string // 계좌 kind, 또는 합성 노드는 "category"
  currency: string
  color: string
  x: number | null
  y: number | null
  synthetic: boolean // true = 카테고리 파생 노드(잔액 없음·좌표 영속 안 함)
  balance: number // 실계좌만
  inflow: number
  outflow: number
}

export type CashEdge = {
  id: string
  source: string // 돈이 나가는 노드
  target: string // 돈이 들어오는 노드
  amount: number
  currency: string
  kind: "transfer" | "revenue" | "expense"
}

const n = (v: number | string | null | undefined): number => Number(v ?? 0)

/** 계좌별 잔액 — 통화별 분리(합산금지). opening + 매출 − 비용 + 이체입금 − (이체출금+수수료). */
export function computeBalances(
  accounts: CashAccount[],
  entries: FinanceEntry[],
  transfers: CashTransfer[]
): Map<string, Balance> {
  const m = new Map<string, Balance>()
  for (const a of accounts) {
    const opening = n(a.opening_balance)
    m.set(a.id, { currency: a.currency, opening, inflow: 0, outflow: 0, balance: opening })
  }
  for (const e of entries) {
    if (!e.account_id) continue
    const b = m.get(e.account_id)
    if (!b || e.currency !== b.currency) continue // 통화 불일치는 합산하지 않음
    if (e.kind === "revenue") b.inflow += n(e.total_amount)
    else b.outflow += n(e.total_amount)
  }
  for (const t of transfers) {
    const to = m.get(t.to_account_id)
    if (to && t.currency === to.currency) to.inflow += n(t.amount)
    const from = m.get(t.from_account_id)
    if (from && t.currency === from.currency) from.outflow += n(t.amount) + n(t.fee_amount)
  }
  for (const b of m.values()) b.balance = b.opening + b.inflow - b.outflow
  return m
}

/** 좌표 없는 노드의 격자 기본 배치. */
function gridXY(i: number): { x: number; y: number } {
  const COLS = 4
  const GX = 190
  const GY = 140
  const PAD = 40
  return { x: PAD + (i % COLS) * GX, y: PAD + Math.floor(i / COLS) * GY }
}

/**
 * 계좌·이체·(옵션)카테고리에서 흐름 그래프 생성.
 * 엣지 = 출처→도착, (kind,source,target,currency)별 금액 집계(통화별).
 * includeCategories=true면 매출/비용 항목을 합성 카테고리 노드로 표현(매출처→계좌 / 계좌→지출처).
 */
export function buildGraph(
  accounts: CashAccount[],
  entries: FinanceEntry[],
  transfers: CashTransfer[],
  opts: { includeCategories?: boolean } = {}
): { nodes: CashNode[]; edges: CashEdge[] } {
  const balances = computeBalances(accounts, entries, transfers)

  const nodes: CashNode[] = accounts.map((a, i) => {
    const b = balances.get(a.id)
    const pos = a.x != null && a.y != null ? { x: n(a.x), y: n(a.y) } : gridXY(i)
    return {
      id: a.id,
      label: a.name,
      kind: a.kind,
      currency: a.currency,
      color: a.color,
      x: pos.x,
      y: pos.y,
      synthetic: false,
      balance: b?.balance ?? 0,
      inflow: b?.inflow ?? 0,
      outflow: b?.outflow ?? 0,
    }
  })

  const edgeMap = new Map<string, CashEdge>()
  const addEdge = (source: string, target: string, currency: string, amount: number, kind: CashEdge["kind"]) => {
    if (amount === 0) return
    const key = `${kind}|${source}|${target}|${currency}`
    const ex = edgeMap.get(key)
    if (ex) ex.amount += amount
    else edgeMap.set(key, { id: key, source, target, amount, currency, kind })
  }

  for (const t of transfers) addEdge(t.from_account_id, t.to_account_id, t.currency, n(t.amount), "transfer")

  if (opts.includeCategories) {
    const catNodes = new Map<string, CashNode>()
    const ensureCat = (kind: "revenue" | "expense", category: string, currency: string): string => {
      const id = `cat:${kind}:${category}`
      if (!catNodes.has(id)) {
        catNodes.set(id, {
          id,
          label: category,
          kind: "category",
          currency,
          color: kind === "revenue" ? "green" : "red",
          x: null,
          y: null,
          synthetic: true,
          balance: 0,
          inflow: 0,
          outflow: 0,
        })
      }
      return id
    }
    for (const e of entries) {
      if (!e.account_id) continue
      const cat = e.category || (e.kind === "revenue" ? "기타매출" : "기타지출")
      if (e.kind === "revenue") {
        const catId = ensureCat("revenue", cat, e.currency)
        addEdge(catId, e.account_id, e.currency, n(e.total_amount), "revenue")
      } else {
        const catId = ensureCat("expense", cat, e.currency)
        addEdge(e.account_id, catId, e.currency, n(e.total_amount), "expense")
      }
    }
    let i = accounts.length
    for (const c of catNodes.values()) {
      const pos = gridXY(i++)
      c.x = pos.x
      c.y = pos.y
      nodes.push(c)
    }
  }

  return { nodes, edges: [...edgeMap.values()] }
}

export type Movement = {
  id: string
  date: string
  type: "입금" | "출금" | "이체"
  account: string
  counter: string
  currency: string
  amount: number
  memo: string
}

/** entries(계좌 지정분) + transfers를 거래 한 줄씩으로 병합(최신순). 그리드 표시·export 공용. */
export function buildMovements(accounts: CashAccount[], entries: FinanceEntry[], transfers: CashTransfer[]): Movement[] {
  const nameById = new Map(accounts.map((a) => [a.id, a.name]))
  return [
    ...entries
      .filter((e) => e.account_id)
      .map((e) => ({
        id: `e:${e.id}`,
        date: e.entry_date,
        type: e.kind === "revenue" ? ("입금" as const) : ("출금" as const),
        account: nameById.get(e.account_id ?? "") ?? "—",
        counter: e.category || e.vendor || "—",
        currency: e.currency,
        amount: Number(e.total_amount),
        memo: e.description ?? "",
      })),
    ...transfers.map((t) => ({
      id: `t:${t.id}`,
      date: t.transfer_date,
      type: "이체" as const,
      account: nameById.get(t.from_account_id) ?? "—",
      counter: nameById.get(t.to_account_id) ?? "—",
      currency: t.currency,
      amount: Number(t.amount),
      memo: t.memo ?? "",
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))
}
