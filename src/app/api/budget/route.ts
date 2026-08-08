import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkBudget } from "@/lib/budget"

export const runtime = "nodejs"

/** 이번 달 AI 사용액·월 한도 + 남은 AI 크레딧 조회 (모든 로그인 유저).
 *  checkBudget이 credit_sync를 호출하므로 이 GET 자체가 '경과일만큼 충전'을 겸한다. */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await checkBudget(user.id)
  return NextResponse.json({
    spent: b.spent,
    limit: b.limit,
    isAdmin: b.isAdmin,
    credits: b.credits, // null = 무제한 플랜
  })
}

/** 월 예산 한도 설정 (관리자만). 0/빈값 = 무제한(null). */
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (prof?.role !== "admin") return NextResponse.json({ error: "관리자만 가능해요." }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { monthly_budget_usd?: number | null }
  const raw = body.monthly_budget_usd
  const limit = raw == null || Number(raw) === 0 ? null : Number(raw)
  if (limit != null && (!Number.isFinite(limit) || limit < 0)) {
    return NextResponse.json({ error: "올바른 금액을 입력하세요." }, { status: 400 })
  }

  // B2 감사 S1: guest 제외 + order 명시(비결정 limit(1) → 엉뚱한 워크스페이스 예산 변경 방지).
  const admin = createAdminClient()
  const { data: mem } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .neq("role", "guest")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!mem?.workspace_id) return NextResponse.json({ error: "워크스페이스를 찾을 수 없어요." }, { status: 404 })

  const { error } = await admin.from("workspaces").update({ monthly_budget_usd: limit }).eq("id", mem.workspace_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, limit })
}
