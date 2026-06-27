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

/** 슬롯 구분(돈 항목 유형) — 그리드 "구분" 칩/셀렉트 SSOT. kind 값은 cash_accounts.kind에 저장. */
export const SLOT_TYPES = [
  { value: "revenue_src", label: "매출", color: "green" },
  { value: "expense_dst", label: "비용", color: "red" },
  { value: "reserve", label: "보유금", color: "blue" },
] as const

export type SlotTypeValue = (typeof SLOT_TYPES)[number]["value"]

/** 계산 유형 — 행 금액을 어떻게 계산하나(computeSlotAmount). */
export const ITEM_TYPES = [
  { value: "fixed", label: "정액" }, // 금액 직접
  { value: "qty", label: "수량" }, // 갯수 × 단가
  { value: "channel", label: "채널" }, // 판매수 × (단가 × (1−수수료) − 택배비)
] as const
export type ItemTypeValue = (typeof ITEM_TYPES)[number]["value"]
const SLOT_MAP = new Map(SLOT_TYPES.map((s) => [s.value, s]))
export function slotLabel(kind: string): string {
  return SLOT_MAP.get(kind as SlotTypeValue)?.label ?? "비용"
}
export function slotColor(kind: string): string {
  return SLOT_MAP.get(kind as SlotTypeValue)?.color ?? "gray"
}

/** 업종별 시작 템플릿 — 대표 매출·비용 항목을 미리 채움(이후 자유 편집). 빈 상태 진입용. */
export type SlotTemplate = { name: string; kind: SlotTypeValue; color: string; amount?: number }
export const CASHFLOW_TEMPLATES: { id: string; label: string; slots: SlotTemplate[] }[] = [
  {
    id: "ecommerce",
    label: "이커머스",
    slots: [
      { name: "스마트스토어 매출", kind: "revenue_src", color: "green" },
      { name: "쿠팡 매출", kind: "revenue_src", color: "green" },
      { name: "광고비", kind: "expense_dst", color: "red" },
      { name: "판매 수수료", kind: "expense_dst", color: "orange" },
      { name: "인건비", kind: "expense_dst", color: "purple" },
      { name: "물류비", kind: "expense_dst", color: "yellow" },
      { name: "사내 보유금", kind: "reserve", color: "blue" },
    ],
  },
  {
    id: "manufacturing",
    label: "제조",
    slots: [
      { name: "제품 매출", kind: "revenue_src", color: "green" },
      { name: "원자재비", kind: "expense_dst", color: "red" },
      { name: "인건비", kind: "expense_dst", color: "purple" },
      { name: "설비·유지보수", kind: "expense_dst", color: "orange" },
      { name: "임대료", kind: "expense_dst", color: "yellow" },
      { name: "사내 보유금", kind: "reserve", color: "blue" },
    ],
  },
  {
    id: "service",
    label: "서비스",
    slots: [
      { name: "용역·서비스 매출", kind: "revenue_src", color: "green" },
      { name: "인건비", kind: "expense_dst", color: "purple" },
      { name: "마케팅비", kind: "expense_dst", color: "red" },
      { name: "임대료", kind: "expense_dst", color: "yellow" },
      { name: "운영비", kind: "expense_dst", color: "orange" },
      { name: "사내 보유금", kind: "reserve", color: "blue" },
    ],
  },
  {
    id: "general",
    label: "일반",
    slots: [
      { name: "매출", kind: "revenue_src", color: "green" },
      { name: "인건비", kind: "expense_dst", color: "purple" },
      { name: "임대료", kind: "expense_dst", color: "yellow" },
      { name: "운영비", kind: "expense_dst", color: "orange" },
      { name: "사내 보유금", kind: "reserve", color: "blue" },
    ],
  },
]

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
