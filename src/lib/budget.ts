// AI 비용 예산 한도 — 워크스페이스 월 예산(monthly_budget_usd) 대비 이번 달 사용액(agent_usage.cost_usd) 검사.
// 초과 & 비관리자면 차단(hard limit). 관리자는 예외. 서버 전용(admin client로 신뢰성 있게 조회 — RLS fail-open 방지).
// ⚠️ 단일 워크스페이스 전제: 사용자의 첫 멤버십 워크스페이스로 스코프. (B1-b 멀티테넌트 시 그대로 동작.)
import { createAdminClient } from "@/lib/supabase/admin"
import { syncCredits, creditBlockReason, type UsageKind } from "@/lib/credits"

export type BudgetStatus = {
  ok: boolean // false = 차단
  spent: number // 이번 달 사용액(USD)
  limit: number | null // 월 한도(USD), null=무제한
  isAdmin: boolean
  /** 남은 AI 크레딧. null = 무제한 플랜. */
  credits: number | null
  /** 워크스페이스 요금제 id(잔액 게이지의 상한 계산용). */
  plan: string | null
  /** 차단 사유별 안내 문구(ok=false일 때). */
  message: string | null
}

/** 실행당 상한(USD) — 워크플로우 1회 누적 비용이 이 값을 넘으면 중단. */
export const PER_RUN_MAX_USD = 2

/** 예산 초과 차단 시 사용자 안내 메시지. */
export const BUDGET_EXCEEDED_MSG = "이번 달 AI 예산을 초과했어요. 관리자에게 문의하세요."

/**
 * 이번 달 워크스페이스 AI 비용 vs 월 예산 + 크레딧 게이트. 관리자는 예산 한도만 예외.
 *
 * `kind`는 하이브리드 한도의 기준이다. 기본값이 "automated"(엄격)인 것은 의도적이다 —
 * 새 라우트가 표시를 빼먹으면 **막히는 쪽**으로 실패해야지, 조용히 무제한이 되면 안 된다
 * (마이그133이 차감을 트리거에 둔 것과 같은 이유). 사람이 직접 누르는 라우트만 명시적으로
 * "interactive"를 넘긴다.
 */
export async function checkBudget(userId: string, kind: UsageKind = "automated"): Promise<BudgetStatus> {
  const admin = createAdminClient()

  const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle()
  const isAdmin = prof?.role === "admin"

  // 사용자의 정식 멤버십 워크스페이스(첫 멤버십·게스트 제외). B2 감사 V3/S1: guest 제외 + order 명시로
  // getUserWorkspaceId와 동일 워크스페이스를 가리키게(비결정 limit(1) → 오귀속 방지).
  const { data: mem } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .neq("role", "guest")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  const wsId = mem?.workspace_id
  if (!wsId) return { ok: true, spent: 0, limit: null, isAdmin, credits: null, plan: null, message: null }

  const { data: ws0 } = await admin.from("workspaces").select("monthly_budget_usd, plan").eq("id", wsId).maybeSingle()
  const plan = ws0?.plan ?? null

  // 크레딧 게이트 — 경과일만큼 충전한 뒤 잔액을 본다(무료는 하루 17씩 상한 500까지 회복).
  // 관리자도 예외 없음: 예산은 우리 내부 통제지만 크레딧은 요금제로 판 것이라 우회하면 과금이 무너진다.
  const credit = await syncCredits(wsId)
  const creditBlocked = creditBlockReason(credit.balance, plan, kind)
  if (creditBlocked) {
    return {
      ok: false,
      spent: 0,
      limit: null,
      isAdmin,
      credits: credit.balance,
      plan,
      message: creditBlocked,
    }
  }

  const limit = ws0?.monthly_budget_usd != null ? Number(ws0.monthly_budget_usd) : null

  // 이번 달 성공 호출 비용 합계.
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const { data: rows } = await admin
    .from("agent_usage")
    .select("cost_usd")
    .eq("workspace_id", wsId)
    .gte("created_at", monthStart)
    .eq("success", true)
  const spent = (rows ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)

  if (limit == null) {
    return { ok: true, spent, limit: null, isAdmin, credits: credit.balance, plan, message: null } // 무제한
  }
  const withinBudget = isAdmin || spent < limit
  return {
    ok: withinBudget,
    spent,
    limit,
    isAdmin,
    credits: credit.balance,
    plan,
    message: withinBudget ? null : BUDGET_EXCEEDED_MSG,
  }
}
