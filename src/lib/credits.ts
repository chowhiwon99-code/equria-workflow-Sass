// AI 크레딧 — 잔액 조회·충전(마이그132) 서버 헬퍼.
//
// 단위: 1 크레딧 = $0.01 원가. 차감은 앱이 아니라 **DB 트리거**가 한다(마이그133) —
// AI 라우트가 9곳이라 앱에서 차감하면 하나는 반드시 누락되고, 새 라우트가 조용히 무료가 된다.
// 여기서는 "충전 + 잔액 확인"만 담당한다.
//
// 충전은 크론이 아니라 호출 시점 lazy 계산(credit_sync)이다. 무료 플랜은 하루 17크레딧씩
// 상한 500까지 회복되므로, 하루치를 다 써도 다음 날 다시 쓸 수 있다.
import { createAdminClient } from "@/lib/supabase/admin"

/** 1 크레딧에 해당하는 원가(USD). */
export const USD_PER_CREDIT = 0.01

/** 크레딧 소진 시 사용자 안내. */
export const CREDIT_EXHAUSTED_MSG =
  "이번 크레딧을 다 썼어요. 내일 다시 충전되고, 더 필요하면 요금제를 올리면 바로 늘어나요."

/** USD 원가 → 크레딧. */
export function usdToCredits(usd: number): number {
  return Math.round((usd / USD_PER_CREDIT) * 100) / 100
}

export type CreditStatus = {
  /** 잔액(크레딧). null = 무제한 플랜(게이팅 없음). */
  balance: number | null
  /** false = 차단해야 함. */
  ok: boolean
}

/** 워크스페이스 크레딧을 최신화(경과일만큼 충전)하고 잔액을 돌려준다.
 *  실패하면 **열어준다**(fail-open) — 크레딧 조회 장애로 AI 전체가 멈추는 게 더 나쁘다.
 *  잔액이 0 이하면 차단. 스트리밍이라 호출 전엔 비용을 모르므로 사전 검사는 "잔액이 남아있나"만 본다. */
export async function syncCredits(workspaceId: string | null | undefined): Promise<CreditStatus> {
  if (!workspaceId) return { balance: null, ok: true }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc("credit_sync", { p_workspace_id: workspaceId })
    if (error) return { balance: null, ok: true }
    if (data == null) return { balance: null, ok: true } // 무제한 플랜
    const balance = Number(data)
    return { balance, ok: balance > 0 }
  } catch {
    return { balance: null, ok: true }
  }
}
