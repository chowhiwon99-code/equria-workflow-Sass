// AI 크레딧 — 잔액 조회·충전(마이그132) 서버 헬퍼.
//
// ⚠️ **사용자에게 보이는 문구에는 "충전·크레딧 충전·포인트" 표현을 쓰지 말 것.**
//    포트원 위험업종 문서: "포인트(크레딧/사이버머니) 충전 형태의 서비스는 PG·카드사 입점이 제한적".
//    KCP 반려의 추정 원인이 이 분류였다 → 화면 문구는 "사용량 제공 / 다시 쓸 수 있어요"처럼 쓴다.
//    한도 증가는 **요금제 업그레이드** 또는 후불 가산으로만 제공한다(충전 상품 신설 금지).
//    아래 주석의 "충전"은 credit_sync의 회복 로직을 가리키는 내부 기술 용어다(화면 노출 아님).
//
// 단위: 1 크레딧 = $0.01 원가. 차감은 앱이 아니라 **DB 트리거**가 한다(마이그133) —
// AI 라우트가 9곳이라 앱에서 차감하면 하나는 반드시 누락되고, 새 라우트가 조용히 무료가 된다.
// 여기서는 "충전 + 잔액 확인"만 담당한다.
//
// 충전은 크론이 아니라 호출 시점 lazy 계산(credit_sync)이다. 무료 플랜은 하루 17크레딧씩
// 상한 500까지 회복되므로, 하루치를 다 써도 다음 날 다시 쓸 수 있다.
import { createAdminClient } from "@/lib/supabase/admin"
import { planOf } from "@/lib/plans"

/** 1 크레딧에 해당하는 원가(USD). */
export const USD_PER_CREDIT = 0.01

/**
 * AI 호출의 종류 — 하이브리드 한도의 기준(대표 결정 2026-08-10).
 * · interactive = 사람이 직접 눌러서 도는 것(채팅·보조·수식 도우미). 공정 사용 범위에서는 막지 않는다.
 * · automated   = 사람 없이 토큰을 태우는 것(워크플로우 자동실행·다단계 리서치·배치 정리). 포함량을 넘으면 막는다.
 *
 * 노션도 같은 구조다(일반 AI 무제한 / 자율 에이전트만 크레딧). 우리는 노션 대비 1/5 가격이라
 * 전 기능 무제한은 불가능하지만, "채팅이 갑자기 멈추는" 경험만은 피한다.
 *
 * 분류는 checkBudget 호출부에 있다 — `grep -rn '"interactive"' src/app` 하면 관대한 쪽 전부가 나온다.
 * 표시가 없으면 automated(엄격)다. 다단계 리서치는 사용자가 눌러서 시작해도 그 뒤로는 스스로
 * 여러 호출을 도는 자율 실행이라 automated로 둔다.
 */
export type UsageKind = "interactive" | "automated"

/**
 * 공정 사용 안전밸브 — interactive도 무한은 아니다. 포함량의 배수까지 쓰면 그때는 막는다.
 * 없으면 무료 워크스페이스 하나가 원가를 무제한으로 태울 수 있다.
 *
 * 배수는 **플랜별**(`PlanDef.fairUseMultiplier`)이다 — 무료 1.0 / 유료 1.3.
 * 이전에는 전 플랜 공통 3배였는데, 그러면 Standard 최악 원가가 3,000×3 = 9,000크레딧 = $90
 * (매출 $19.16 대비 **원가율 470%**)이 되어 안전밸브가 아니라 적자 밸브였다.
 * 2026-08-14 원가율 40% 재설계로 포함량을 750/1,300으로 내리면서 배수도 함께 낮췄다
 * → 최악 원가율 Standard 50.9% · Pro 52.2%.
 */
export function fairUseMultiplierOf(plan: string | null | undefined): number {
  return planOf(plan).fairUseMultiplier
}

/** 자동 실행분 소진 안내 — 채팅은 계속 된다는 걸 반드시 알려준다(고장으로 오해 방지). */
export const CREDIT_EXHAUSTED_MSG =
  "자동 실행에 쓸 AI 사용량을 다 썼어요. 채팅은 그대로 쓸 수 있고, 자동 실행은 내일 다시 쓸 수 있어요."

/** 공정 사용 한도까지 넘긴 경우(사실상 드묾). */
export const FAIR_USE_EXCEEDED_MSG =
  "이번 요금제의 공정 사용량을 크게 넘었어요. 요금제를 올리면 바로 풀려요."

/** USD 원가 → 크레딧. */
export function usdToCredits(usd: number): number {
  return Math.round((usd / USD_PER_CREDIT) * 100) / 100
}

export type CreditStatus = {
  /** 잔액(크레딧). null = 무제한 플랜(게이팅 없음). */
  balance: number | null
}

/**
 * 이 호출을 막아야 하는지. 막아야 하면 안내 문구를, 통과면 null을 돌려준다.
 *
 * 차감은 종류와 무관하게 항상 일어난다(원가 관측을 잃지 않기 위해) — 달라지는 건 **차단 시점**뿐이다.
 * interactive는 잔액이 음수로 내려가도 계속 쓰다가, 포함량 × 플랜별 공정사용 배수에서 멈춘다.
 * 무료(배수 1.0)는 잔액 0에서 바로 멈추는데, 하루 17크레딧씩 회복되므로 다음 날 다시 쓸 수 있다.
 */
export function creditBlockReason(
  balance: number | null,
  plan: string | null | undefined,
  kind: UsageKind
): string | null {
  if (balance == null) return null // 무제한 플랜
  if (kind === "automated") return balance > 0 ? null : CREDIT_EXHAUSTED_MSG
  const { includedCredits: cap, fairUseMultiplier: mult } = planOf(plan)
  const floor = -cap * (mult - 1) // 총 사용 가능량 = 포함량 × 배수
  return balance > floor ? null : FAIR_USE_EXCEEDED_MSG
}

/** 워크스페이스 크레딧을 최신화(경과일만큼 충전)하고 잔액을 돌려준다.
 *  실패하면 **열어준다**(fail-open) — 크레딧 조회 장애로 AI 전체가 멈추는 게 더 나쁘다.
 *  차단 판정은 호출 종류를 아는 checkBudget이 creditBlockReason으로 한다. */
export async function syncCredits(workspaceId: string | null | undefined): Promise<CreditStatus> {
  if (!workspaceId) return { balance: null }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc("credit_sync", { p_workspace_id: workspaceId })
    if (error) return { balance: null }
    if (data == null) return { balance: null } // 무제한 플랜
    return { balance: Number(data) }
  } catch {
    return { balance: null }
  }
}
