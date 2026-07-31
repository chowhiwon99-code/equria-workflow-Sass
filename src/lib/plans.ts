/**
 * 요금제 정의 SSOT(세션41 — 플랜 게이팅) — 랜딩 가격표·시트 한도와 정합.
 * 시트 = 비게스트 멤버 수(오너 포함). 게스트(제한된 멤버)는 시트를 소비하지 않는다.
 * 서버 강제는 accept_workspace_invite RPC(마이그 125)가 담당 — 여기 값과 반드시 일치시킬 것.
 */
export type PlanId = "free" | "standard" | "pro" | "premium"

export type PlanDef = {
  id: PlanId
  label: string
  seats: number | null // null = 무제한(협의)
  priceKrw: number | null // null = 문의
  includedCredits: number
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: { id: "free", label: "Basic", seats: 3, priceKrw: 0, includedCredits: 500 },
  standard: { id: "standard", label: "Standard", seats: 5, priceKrw: 29000, includedCredits: 3000 },
  pro: { id: "pro", label: "Pro", seats: 10, priceKrw: 49000, includedCredits: 7000 },
  premium: { id: "premium", label: "Premium", seats: null, priceKrw: null, includedCredits: 0 },
}

/** plan 문자열 → 정의(알 수 없으면 free로 안전 폴백). */
export function planOf(plan: string | null | undefined): PlanDef {
  return PLANS[(plan ?? "free") as PlanId] ?? PLANS.free
}

/** 다음 상위 플랜(업그레이드 안내용). premium이면 null. */
export function nextPlan(plan: string | null | undefined): PlanDef | null {
  const order: PlanId[] = ["free", "standard", "pro", "premium"]
  const i = order.indexOf(planOf(plan).id)
  return i >= 0 && i < order.length - 1 ? PLANS[order[i + 1]] : null
}

/** 시트가 꽉 찼는지 — seatsUsed(비게스트 멤버 수) 기준. 무제한(null)이면 항상 여유. */
export function seatsFull(plan: string | null | undefined, seatsUsed: number): boolean {
  const seats = planOf(plan).seats
  return seats != null && seatsUsed >= seats
}
