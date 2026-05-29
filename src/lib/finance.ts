/**
 * 비용·매출 카테고리 SSOT — 이큐리아 계산기 엑셀 구조 기반.
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
