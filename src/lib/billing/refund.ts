// 공정 환불 계산 — 법적 의무④ (나이스페이 계약 제22조 · 여신전문금융업법 시행령).
//
// 🔴 **이 파일은 `/refund` 페이지에 이미 공표한 문구를 코드로 옮긴 것이다.**
//    한쪽만 고치면 분쟁에서 진다. `src/app/refund/page.tsx`를 고칠 때 여기도 같이 고칠 것.
//    아래 각 분기에 근거 조항을 그대로 달아 둔 이유가 그것이다(대조가 눈으로 되게).
//
// 공표된 규칙 (2026-07-27 시행 · 원문 요약)
//   제1조 1항  결제일로부터 **7일 이내** + 서비스를 **사용하지 않은 경우** → 전액 환불
//   제1조 2항  결제일로부터 7일 이내 + 일부 이용 → 이용한 기간·사용량 공제 후 잔액
//   제2조 1항  **월 구독** — 해지 시 다음 결제일부터 중단, 이미 결제된 기간은 만료일까지 이용
//              → 즉 7일이 지난 월 구독의 중도 환불은 **없다**
//   제2조 2항  **연 구독** — 중도 해지 시 이용한 기간을 **월 요금 기준으로** 환산·공제한 잔액 환불
//   제2조 3항  프로모션·할인 적용분은 **정가 기준**으로 재산정될 수 있음
//   제5조     이미 소진된 사용량 기반 요금(AI 사용량 등)은 환불이 제한될 수 있음
//
// 대표 결정 (2026-08-21)
//   · 연 구독 중도 해지의 "이용한 기간"은 **날짜로 쪼개 계산**한다(달 단위 올림이 아니라 일할).
//     달을 통째로 올리면 우리가 덜 돌려주지만 "안 쓴 날까지 왜 떼느냐"는 항의가 나온다.
//     공표 문구의 "환산"에도 일할이 더 가깝고, 건당 차액은 1~2만원 수준이라 분쟁 위험을 택하지 않았다.
//   · **AI 사용량은 금액에서 공제하지 않는다.** 제5조가 "제한될 수 있습니다"라는 재량 표현이고,
//     사용량을 돈으로 환산해 떼기 시작하면 고객이 검증할 수 없는 숫자가 된다.
//     사용 여부는 제1조 1항의 "전액 환불인가"를 가르는 데만 쓴다.
//
// ⚠️ 7일이 지난 **월 구독**은 환불이 0으로 뚝 떨어진다(제2조 1항). 이건 버그가 아니라 공표한 정책이다.
//    7일 이내는 청약철회(법정 권리)라 예외적으로 일할 환불이 나간다.
import { planOf } from "@/lib/plans"
import type { BillingCycle, PayablePlan } from "@/lib/billing/orders"

/** 청약철회 기간(일). 제1조 1항. */
export const COOLING_OFF_DAYS = 7

const DAY_MS = 86_400_000

/** 환불 계산에 필요한 사실들. **전부 우리 DB에 있는 값**이고 추정치가 섞이지 않는다. */
export type RefundBasis = {
  /** 실제 결제한 금액(원, 부가세 포함) = billing_payments.amount_krw */
  amountKrw: number
  plan: PayablePlan
  billingCycle: BillingCycle
  /** 이 결제가 커버하는 기간 */
  periodStart: Date
  periodEnd: Date
  /** 결제 승인 시각 — 제1조의 "결제일" 기산점 */
  approvedAt: Date
  /**
   * 결제 후 서비스를 사용했는가 — 제1조 1항의 "사용하지 않은 경우" 판정.
   * 판정은 호출부가 한다(이 함수는 순수 계산만). AI 사용 기록 유무가 가장 객관적인 근거다.
   */
  used: boolean
  /** 환불 기준 시각(기본 now). 테스트·시뮬에서 시간을 옮기기 위해 인자로 둔다. */
  at?: Date
}

export type RefundQuote = {
  /** 돌려줄 금액(원). 0 이상 · 결제액 이하로 잘린다. */
  refundKrw: number
  /** 이용분으로 공제한 금액(원). refundKrw + deductedKrw = amountKrw */
  deductedKrw: number
  /** 근거 조항. 감사 로그·고객 안내에 **그대로** 쓴다(왜 이 금액인지 설명이 필요하므로). */
  clause: string
  /** 고객에게 보여줄 한 줄 설명. "충전·크레딧·포인트" 금지(PG 위험업종 분류 회피). */
  reason: string
}

/** 두 시각 사이의 일수(소수). 시간대 계산은 하지 않는다 — 절대 시각 차이만 본다. */
function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / DAY_MS
}

/** 원 단위 정수로 자른다. 돈은 소수점이 없다. */
function won(v: number): number {
  return Math.max(0, Math.round(v))
}

/**
 * 지금 해지·환불하면 얼마를 돌려줘야 하는가.
 *
 * 반환은 **항상** `refundKrw + deductedKrw === amountKrw`를 만족한다(회계가 맞아야 한다).
 */
export function computeFairRefundKrw(basis: RefundBasis): RefundQuote {
  const at = basis.at ?? new Date()
  const amount = Math.max(0, Math.round(basis.amountKrw))

  const quote = (refund: number, clause: string, reason: string): RefundQuote => {
    const r = Math.min(amount, won(refund))
    return { refundKrw: r, deductedKrw: amount - r, clause, reason }
  }

  // 이미 이용 기간이 끝났으면 돌려줄 것이 없다. 남은 기간이 0이기 때문이고, 조항 이전의 산수다.
  if (at.getTime() >= basis.periodEnd.getTime()) {
    return quote(0, "제2조 1항", "이용 기간이 이미 끝나 환불 대상 금액이 없어요.")
  }

  const totalDays = Math.max(1, daysBetween(basis.periodStart, basis.periodEnd))
  const usedDays = Math.max(0, daysBetween(basis.periodStart, at))
  const daysSincePayment = daysBetween(basis.approvedAt, at)

  // ── 제1조 (청약철회) — 결제일로부터 7일 이내. 법정 권리라 아래 제2조보다 우선한다. ──
  if (daysSincePayment <= COOLING_OFF_DAYS) {
    if (!basis.used) {
      // 제1조 1항 — 사용하지 않았으면 전액.
      return quote(amount, "제1조 1항", "결제 후 7일 이내이고 서비스를 사용하지 않아 전액 환불돼요.")
    }
    // 제1조 2항 — 일부 이용했으면 이용한 기간만큼 공제.
    const deducted = amount * (usedDays / totalDays)
    return quote(
      amount - deducted,
      "제1조 2항",
      `결제 후 7일 이내라 이용하신 ${Math.ceil(usedDays)}일치를 뺀 금액을 환불해요.`,
    )
  }

  // ── 제2조 1항 (월 구독) — 7일이 지나면 중도 환불이 없다. 만료일까지 그대로 이용한다. ──
  if (basis.billingCycle !== "yearly") {
    return quote(
      0,
      "제2조 1항",
      "월 구독은 이미 결제한 기간을 만료일까지 그대로 쓰실 수 있고, 다음 결제부터 청구되지 않아요.",
    )
  }

  // ── 제2조 2항 (연 구독 중도 해지) — 이용한 기간을 **월 요금(정가) 기준**으로 환산·공제. ──
  //    연간가는 월가×10(2개월 무료)이라, 중도 해지하면 그 할인분이 자연히 회수된다.
  //    정가를 쓰는 근거는 제2조 3항("프로모션·할인 적용분은 정가 기준으로 재산정").
  const monthlyList = planOf(basis.plan).priceKrw
  if (monthlyList == null || monthlyList <= 0) {
    // 정가가 없는 요금제(협의가)는 자동 계산 대상이 아니다 — 사람이 판단해야 한다.
    return quote(0, "제2조 2항", "협의 요금제는 담당자 확인 후 환불 금액을 안내드려요.")
  }

  // 이용한 개월 수(소수). 대표 결정대로 달 단위 올림이 아니라 날짜로 쪼갠다.
  const daysPerMonth = totalDays / 12
  const usedMonths = usedDays / daysPerMonth
  const deducted = monthlyList * usedMonths

  return quote(
    amount - deducted,
    "제2조 2항",
    `연 구독은 이용하신 기간을 월 요금(${monthlyList.toLocaleString("ko-KR")}원) 기준으로 환산해 뺀 금액을 환불해요.`,
  )
}
