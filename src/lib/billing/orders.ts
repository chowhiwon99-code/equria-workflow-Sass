// 결제 금액·주문번호 — 결제의 "가격표"를 읽는 유일한 곳.
//
// ⚠️ **결제 금액은 반드시 quoteAmountKrw()로만 만든다.**
//    클라이언트가 보낸 금액을 그대로 쓰면 브라우저에서 100원으로 바꿔 Pro를 여는
//    고전적인 사고가 난다(한국 PG 사고 1순위). 흐름은 이렇게 고정한다:
//      ① 서버가 quoteAmountKrw()로 금액 산출
//      ② billing_start_checkout RPC가 그 금액을 'ready' 행에 못박음
//      ③ 승인 응답·웹훅·조회 API의 금액을 ②와 대조(billing_apply_payment가 불일치 시 예외)
//    즉 클라이언트 금액은 **어느 경로로도 DB에 닿지 않는다.**
//
// 금액 정의: 전부 **부가세 포함 총액(정수 원)**. plans.ts priceKrw/priceKrwYearly ·
//    랜딩 가격표 · billing_payments.amount_krw · 환불 계산이 모두 같은 정의여야 한다.
//    하나라도 "부가세 별도"로 해석하면 환불 일할 계산에서 10%가 어긋난다.
import { planOf, type PlanId } from "@/lib/plans"

export type BillingCycle = "monthly" | "yearly"

/** 결제 가능한 플랜 — free는 결제 대상이 아니고 premium은 협의가(내부용)다. */
export type PayablePlan = Extract<PlanId, "standard" | "pro">

export function isPayablePlan(plan: string): plan is PayablePlan {
  return plan === "standard" || plan === "pro"
}

/**
 * 이 결제로 청구할 금액(원, 부가세 포함).
 *
 * `seats`는 **요금제 기본 인원을 넘는 추가 좌석 수**가 아니라 전체 좌석 수를 받는다.
 * 지금은 좌석 추가 판매가 없으므로(랜딩 "₩4,000/인" 문구는 2026-08-15에 제거됨 —
 * 제품이 기본 인원 초과를 거부하기 때문) 추가분은 0으로 계산한다.
 * 좌석 추가 구매가 열리면 여기에만 단가를 더하면 된다.
 */
export function quoteAmountKrw(plan: PayablePlan, cycle: BillingCycle, seats = 0): number {
  const def = planOf(plan)
  const base = cycle === "yearly" ? def.priceKrwYearly : def.priceKrw
  if (base == null) throw new Error(`가격이 정의되지 않은 요금제입니다: ${plan}`)

  // 추가 좌석 과금은 미도입(정기결제 빌링키 승인 후 열린다). seats는 스냅샷 용도로만 기록된다.
  const extraSeats = Math.max(0, seats - (def.seats ?? seats))
  const extraKrw = 0 * extraSeats

  return base + extraKrw
}

/** 이번 결제가 커버하는 기간. 월 결제는 1개월, 연 결제는 12개월. */
export function periodFor(cycle: BillingCycle, from = new Date()): { start: Date; end: Date } {
  const start = new Date(from)
  const end = new Date(from)
  if (cycle === "yearly") end.setFullYear(end.getFullYear() + 1)
  else end.setMonth(end.getMonth() + 1)
  // ⚠️ setMonth는 말일을 자동 보정한다(1/31 + 1개월 → 3/3이 아니라 3/2·3/3이 될 수 있음).
  //    31일 결제 건의 다음 결제일이 밀리는 것을 막기 위해, 넘친 경우 그 달 말일로 당긴다.
  if (cycle === "monthly" && end.getDate() !== start.getDate()) end.setDate(0)
  return { start, end }
}

/**
 * 주문번호. 나이스페이 승인·조회의 키이자 우리 쪽 멱등 앵커다(billing_payments.order_id unique).
 * 워크스페이스를 앞에 두어 관리자 화면에서 눈으로 추적할 수 있게 한다.
 */
export function newOrderId(workspaceId: string): string {
  const ws = workspaceId.replace(/-/g, "").slice(0, 8)
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `CPL-${ws}-${ts}${rand}`.toUpperCase()
}

/**
 * 매달 자동청구(갱신) 주문번호의 접두사. 첫 결제(`CPL-`)와 **반드시 구분돼야 한다** —
 * "결과를 모르는 갱신 시도가 남아 있는가"를 이 접두사로 찾기 때문이다(renew.ts).
 */
export const RENEW_ORDER_PREFIX = "RNW"

/** 오늘 날짜(한국시간, YYYYMMDD). 결제·정산은 전부 한국 기준이라 UTC로 계산하면 하루 어긋난다. */
export function kstYmd(at: Date = new Date()): string {
  // sv-SE 로캘이 YYYY-MM-DD를 준다(ko-KR은 "2026. 8. 21." 형태라 파싱이 지저분해진다).
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(at).replace(/-/g, "")
}

/**
 * 갱신 청구의 주문번호. 형식: `RNW-<워크스페이스8>-<YYYYMMDD>`
 *
 * 🔴 날짜를 넣는 이유가 **중복 청구 방지**다. 같은 워크스페이스·같은 날짜면 주문번호가 같고,
 *    `billing_payments.order_id`가 unique라 **두 번째 시도는 DB가 거부한다.**
 *    크론이 중복 실행되거나(Vercel 크론은 중복 실행이 가능하다고 문서에 명시) 화면에서 지연
 *    대사가 동시에 돌아도 청구는 하루 한 번을 넘을 수 없다.
 * 🔴 날짜는 PG 주문번호 조회(`orderDate` 필수 파라미터)에도 그대로 쓰인다 —
 *    승인 여부를 모르게 됐을 때 이 주문번호만으로 다시 물어볼 수 있어야 하기 때문이다.
 */
export function renewOrderId(workspaceId: string, ymdKst: string = kstYmd()): string {
  const ws = workspaceId.replace(/-/g, "").slice(0, 8)
  return `${RENEW_ORDER_PREFIX}-${ws}-${ymdKst}`.toUpperCase()
}

/** 갱신 주문번호에서 주문일자(YYYYMMDD)를 되꺼낸다. PG 주문번호 조회에 필요. */
export function orderDateOfRenewOrderId(orderId: string): string | null {
  const m = /-(\d{8})$/.exec(orderId)
  return m ? m[1] : null
}

/**
 * PG에 보낼 상품명. 첫 결제와 갱신이 **같은 문구**여야 카드 명세서에서 같은 구독으로 읽힌다.
 * ⚠️ "충전·크레딧·포인트" 금지(PG 위험업종 분류 회피) · 40자 제한은 nicepay.ts가 자른다.
 */
export function goodsNameFor(plan: PayablePlan, cycle: BillingCycle): string {
  return `Complow ${plan === "pro" ? "Pro" : "Standard"} ${cycle === "yearly" ? "연간" : "월"} 구독`
}

/** 화면 표기용 — "₩29,000". 문구에 "충전·크레딧·포인트"를 쓰지 않는다(PG 위험업종 분류 회피). */
export function formatKrw(krw: number): string {
  return `₩${krw.toLocaleString("ko-KR")}`
}
