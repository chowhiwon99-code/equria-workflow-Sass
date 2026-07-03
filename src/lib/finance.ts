/**
 * 비용·매출 카테고리 SSOT — Complow 계산기 엑셀 구조 기반.
 * 새 분류를 추가하려면 여기만 수정하면 입력 폼·집계·필터가 따라온다.
 */

/** 비용(지출) 분류 */
export const EXPENSE_CATEGORIES = [
  "생산비용",
  "마케팅비용",
  "물류비용",
  "도메인/계정",
  "인건비",
  "인증/검사",
  "홈페이지/개발",
  "기타",
] as const

/** 매출 분류 — 주로 판매 플랫폼 */
export const REVENUE_CATEGORIES = [
  "네이버스마트",
  "컬리",
  "개인 폐쇄몰",
  "쿠팡(일반)",
  "쿠팡(로켓)",
  "오프라인",
  "기타",
] as const

export function categoriesFor(kind: "expense" | "revenue"): readonly string[] {
  return kind === "expense" ? EXPENSE_CATEGORIES : REVENUE_CATEGORIES
}

export const won = (n: number | string | null | undefined) =>
  `₩${Number(n ?? 0).toLocaleString()}`

/**
 * 입력값으로 금액 계산.
 * - 공급가(amount) = 갯수 × 단가 (둘 다 있으면) 또는 직접 입력한 amount
 * - 비용 합계(total) = 공급가 + 부가세
 * - 매출 합계(total) = 공급가 − 수수료(fee)
 */
export function computeAmounts(input: {
  kind: "expense" | "revenue"
  quantity?: number | null
  unitPrice?: number | null
  amount?: number | null
  tax?: number | null
  fee?: number | null
}): { amount: number; total: number } {
  const { kind, quantity, unitPrice, amount, tax, fee } = input
  const base =
    quantity != null && unitPrice != null && quantity !== 0
      ? quantity * unitPrice
      : Number(amount ?? 0)
  const total =
    kind === "expense" ? base + Number(tax ?? 0) : base - Number(fee ?? 0)
  return { amount: base, total }
}

/**
 * 손익 계산기 행 금액 — item_type별. 결과를 cash_accounts.amount에 기록(buildSlotGraph가 그대로 롤업).
 *  - channel(매출): 판매수 × (단가 × (1 − 수수료율) − 택배비)   // rate=수수료율(0–1), extra=단위당 택배비
 *  - qty(비용):     갯수 × 단가 + 정액(부가세 등)
 *  - fixed:         입력 금액 그대로
 */
export function computeSlotAmount(input: {
  item_type?: string | null
  units?: number | null
  unit_price?: number | null
  rate?: number | null
  extra?: number | null
  amount?: number | null
}): number {
  const units = Number(input.units ?? 0)
  const unitPrice = Number(input.unit_price ?? 0)
  const rate = Number(input.rate ?? 0)
  const extra = Number(input.extra ?? 0)
  switch (input.item_type) {
    case "channel":
      return units * (unitPrice * (1 - rate) - extra)
    case "qty":
      return units * unitPrice + extra
    default:
      return Number(input.amount ?? 0)
  }
}

/** 지원 통화 — 비용/매출을 KRW 외 달러·유로·엔·위안·비트코인으로 기록·정리. */
export const CURRENCIES = [
  { code: "KRW", symbol: "₩", label: "원 (KRW)" },
  { code: "USD", symbol: "$", label: "달러 (USD)" },
  { code: "EUR", symbol: "€", label: "유로 (EUR)" },
  { code: "JPY", symbol: "¥", label: "엔 (JPY)" },
  { code: "CNY", symbol: "CN¥", label: "위안 (CNY)" },
  { code: "BTC", symbol: "₿", label: "비트코인 (BTC)" },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]["code"]

const CUR_SYMBOL: Record<string, string> = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.symbol]))
const CUR_DECIMALS: Record<string, number> = { KRW: 0, USD: 2, EUR: 2, JPY: 0, CNY: 2, BTC: 8 }

/**
 * 금액을 통화에 맞춰 포맷. 법정화폐는 자릿수 규칙, BTC는 최대 8자리(뒤 0 제거).
 * 미지원 코드는 코드 접미로 표기.
 */
export function money(amount: number | string | null | undefined, currency: string | null | undefined): string {
  const code = currency || "KRW"
  const n = Number(amount ?? 0)
  const sym = CUR_SYMBOL[code]
  if (code === "BTC") {
    return `₿${n.toFixed(8).replace(/\.?0+$/, "") || "0"}`
  }
  const dec = CUR_DECIMALS[code] ?? 2
  const s = n.toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: dec })
  return sym ? `${sym}${s}` : `${s} ${code}`
}
