import type { LucideIcon } from "lucide-react"
import { Wallet, Landmark, CreditCard, PiggyBank, TrendingUp, TrendingDown, Circle } from "lucide-react"

/**
 * 현금흐름 계좌/버킷 종류(노드 유형) SSOT.
 * color 토큰은 meetingMeta CATEGORY_COLORS(gray/red/orange/yellow/green/blue/purple)와 동일 팔레트.
 */
export const ACCOUNT_KINDS = [
  { value: "cash", label: "현금", color: "green", icon: Wallet },
  { value: "bank", label: "통장", color: "blue", icon: Landmark },
  { value: "card", label: "카드", color: "purple", icon: CreditCard },
  { value: "reserve", label: "사내보유금", color: "yellow", icon: PiggyBank },
  { value: "revenue_src", label: "매출처", color: "green", icon: TrendingUp },
  { value: "expense_dst", label: "지출처", color: "red", icon: TrendingDown },
  { value: "other", label: "기타", color: "gray", icon: Circle },
] as const

export type AccountKind = (typeof ACCOUNT_KINDS)[number]["value"]

const KIND_MAP = new Map(ACCOUNT_KINDS.map((k) => [k.value, k]))

export function kindLabel(kind: string): string {
  return KIND_MAP.get(kind as AccountKind)?.label ?? kind
}
export function kindIcon(kind: string): LucideIcon {
  return KIND_MAP.get(kind as AccountKind)?.icon ?? Circle
}
export function kindDefaultColor(kind: string): string {
  return KIND_MAP.get(kind as AccountKind)?.color ?? "gray"
}
