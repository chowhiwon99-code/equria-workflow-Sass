// AI 비용 예산 한도 — 워크스페이스 월 예산(monthly_budget_usd) 대비 이번 달 사용액(agent_usage.cost_usd) 검사.
// 초과 & 비관리자면 차단(hard limit). 관리자는 예외. 서버 전용(admin client로 신뢰성 있게 조회 — RLS fail-open 방지).
// ⚠️ 단일 워크스페이스 전제: 사용자의 첫 멤버십 워크스페이스로 스코프. (B1-b 멀티테넌트 시 그대로 동작.)
import { createAdminClient } from "@/lib/supabase/admin"

export type BudgetStatus = {
  ok: boolean // false = 차단
  spent: number // 이번 달 사용액(USD)
  limit: number | null // 월 한도(USD), null=무제한
  isAdmin: boolean
}

/** 실행당 상한(USD) — 워크플로우 1회 누적 비용이 이 값을 넘으면 중단. */
export const PER_RUN_MAX_USD = 2

/** 예산 초과 차단 시 사용자 안내 메시지. */
export const BUDGET_EXCEEDED_MSG = "이번 달 AI 예산을 초과했어요. 관리자에게 문의하세요."

/** 이번 달 워크스페이스 AI 비용 vs 월 예산. 관리자는 항상 ok. */
export async function checkBudget(userId: string): Promise<BudgetStatus> {
  const admin = createAdminClient()

  const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle()
  const isAdmin = prof?.role === "admin"

  // 사용자의 워크스페이스(첫 멤버십).
  const { data: mem } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()
  const wsId = mem?.workspace_id
  if (!wsId) return { ok: true, spent: 0, limit: null, isAdmin }

  const { data: ws } = await admin
    .from("workspaces")
    .select("monthly_budget_usd")
    .eq("id", wsId)
    .maybeSingle()
  const limit = ws?.monthly_budget_usd != null ? Number(ws.monthly_budget_usd) : null

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

  if (limit == null) return { ok: true, spent, limit: null, isAdmin } // 무제한
  return { ok: isAdmin || spent < limit, spent, limit, isAdmin }
}
