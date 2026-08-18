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
  /**
   * 월 표시가격(원). **부가세 포함 총액**이다(대표 결정 2026-08-18).
   * 즉 ₩29,000을 받으면 순매출은 ₩26,364이고 ₩2,636이 부가세다.
   * ⚠️ 랜딩 가격표 · `billing_payments.amount_krw` · 환불 일할 계산이 **모두 같은 정의**여야 한다.
   *    하나라도 "부가세 별도"로 해석하면 환불 금액이 10% 어긋난다.
   * null = 문의(협의가)
   */
  priceKrw: number | null
  /**
   * 연간 표시가격(원). 부가세 포함. **월가 × 10** = 2개월 무료(랜딩 FAQ 문구와 정합).
   *
   * 연간이 중요한 이유: 빌링키(자동결제)가 아직 승인 전이라 월 구독은 매달 고객이 카드를
   * 다시 입력해야 한다. 연간은 **일반결제 1회로 끝나** 빌링키 없이도 구독이 성립한다.
   * (HANDOFF 결제 트랙 · 대표 결정 2026-08-18)
   */
  priceKrwYearly: number | null
  includedCredits: number
  /**
   * 공정 사용 배수 — interactive(사람이 직접 쓰는) 호출은 포함량의 이 배수까지 막지 않는다.
   * 플랜별로 다른 이유: 무료는 매출이 0이라 초과분이 전부 순손실이지만, 유료는 초과분을
   * 다음 요금제로 올릴 여지(업셀 신호)로 볼 수 있다. 상세는 credits.ts creditBlockReason.
   */
  fairUseMultiplier: number
}

/**
 * 포함량 산정 근거 — **원가율 40% 목표 역산**(대표 결정 2026-08-14).
 *
 *   포함 크레딧 = 월 매출(USD) × 0.40 ÷ $0.01   (1 크레딧 = $0.01 원가)
 *
 * | 플랜     | 월 매출          | 40% 허용 원가 | 역산값 | 채택值 | 포함량 원가율 |
 * |----------|------------------|---------------|--------|--------|---------------|
 * | Standard | ₩29,000 = $19.16 | $7.66         | 766    | 750    | 39.2%         |
 * | Pro      | ₩49,000 = $32.37 | $12.95        | 1,295  | 1,300  | 40.2%         |
 *
 * 환율 ₩1,514/$ 기준. 표시가격(부가세·PG 수수료 차감 전) 기준이므로 실질 원가율은 이보다
 * 높다(부가세 10% + PG 약 3% 반영 시 Standard 약 45%) — 환율·수수료가 크게 움직이면 재계산할 것.
 *
 * Basic(무료)은 매출이 0이라 원가율로 역산할 수 없다 → 포함량 500(=월 $5)을 **전환 미끼 예산**
 * 으로 유지하되 공정 사용 배수를 1.0으로 두어 최악값을 $15 → $5로 묶는다.
 *
 * ⚠️ **DB `plan_monthly_credits()`(마이그138)와 반드시 같은 값이어야 한다.** 차감·충전은 DB가
 *    하고 화면 안내만 이 파일이 하므로, 한쪽만 바꾸면 "안내는 여유인데 실제로 막히는" 상태가 된다.
 * ⚠️ 시트 비례 가산은 **일부러 안 넣었다**(2026-08-15 검증). 초과 좌석이 지금은 생길 수 없다 —
 *    `accept_workspace_invite`가 `plan_seat_limit`(3·5·10) 도달 시 거부하고, `workspace_members`
 *    RLS에 INSERT 정책이 없어 우회도 불가하다. 유일하게 초과가 생기는 경로는 **요금제 다운그레이드**
 *    인데 그 좌석은 **돈을 안 받은 좌석**이라, 비례 가산을 넣으면 미결제 사용량을 주게 된다.
 *    → 좌석 추가 **과금**(=`paid_seats` 기록)이 먼저 생긴 뒤, 그 값에 비례해 +105크레딧/인을 붙일 것.
 *    랜딩의 "₩4,000/인" 문구도 같은 이유로 제거됨(LandingPage.tsx 요금 카드 주석).
 */
export const PLANS: Record<PlanId, PlanDef> = {
  free: { id: "free", label: "Basic", seats: 3, priceKrw: 0, priceKrwYearly: 0, includedCredits: 500, fairUseMultiplier: 1 },
  standard: { id: "standard", label: "Standard", seats: 5, priceKrw: 29000, priceKrwYearly: 290000, includedCredits: 750, fairUseMultiplier: 1.3 },
  pro: { id: "pro", label: "Pro", seats: 10, priceKrw: 49000, priceKrwYearly: 490000, includedCredits: 1300, fairUseMultiplier: 1.3 },
  // 무제한(협의) — credit_sync가 null을 돌려주므로 게이팅 자체가 걸리지 않는다. 배수는 미사용.
  premium: { id: "premium", label: "Premium", seats: null, priceKrw: null, priceKrwYearly: null, includedCredits: 0, fairUseMultiplier: 1 },
}

/** 연간 결제로 아끼는 개월 수(= 12 - 연간가/월가). 랜딩 "2개월 무료" 문구의 근거. */
export const YEARLY_FREE_MONTHS = 2

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

/** 고급 모델을 쓸 수 있는 최소 플랜 — 랜딩 요금표의 Pro '+Opus'와 정합. */
export const PREMIUM_MODEL_MIN_PLAN: PlanId = "pro"

/**
 * 모델 id가 고가 티어(Opus·Fable·Mythos)인지.
 * 개별 id를 나열하지 않고 이름으로 잡는 이유: 새 고가 모델이 나왔을 때 목록에 없어서
 * 무료 플랜에 열리는 fail-open을 막는다(모르는 고가 모델은 막히는 쪽).
 * 단가(2026-08): Opus $5/$25 · Fable/Mythos $10/$50 vs Sonnet $3/$15 · Haiku $1/$5.
 */
export function isPremiumModel(model: string | null | undefined): boolean {
  const m = (model ?? "").toLowerCase()
  return m.includes("opus") || m.includes("fable") || m.includes("mythos")
}

/**
 * 이 플랜에서 해당 모델을 **새로** 고를 수 있는지.
 * 서버 강제는 마이그134 트리거 `agent_version_enforce_model_plan` — 이 함수는 UI 안내용이며
 * 규칙이 바뀌면 **트리거와 반드시 함께** 고칠 것(에이전트 버전은 클라가 Supabase로 직접 insert한다).
 * 이미 그 모델을 쓰던 에이전트의 편집은 트리거가 grandfather 처리하므로 여기서 막지 않아도 된다.
 */
export function canUseModel(plan: string | null | undefined, model: string): boolean {
  if (!isPremiumModel(model)) return true
  const id = planOf(plan).id
  return id === "pro" || id === "premium"
}
