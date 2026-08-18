// 결제 시작 — 결제창을 띄우기 **전에** 서버가 금액을 못박는 지점.
//
// 🔴 이 라우트의 존재 이유가 금액 위변조 방어다(한국 PG 사고 1순위).
//    결제창 파라미터의 금액은 사용자가 브라우저에서 바꿀 수 있어서, 100원으로 고쳐 Pro를 열 수 있다.
//    그래서 흐름을 이렇게 고정한다:
//      ① 클라는 **plan/cycle만** 보낸다. 금액은 절대 받지 않는다.
//      ② 서버가 quoteAmountKrw()로 금액을 산출한다(plans.ts를 읽는 유일한 함수).
//      ③ billing_start_checkout이 그 금액을 'ready' 행에 못박는다.
//      ④ 나중에 승인 응답·웹훅·조회 API의 금액을 ③과 대조한다(billing_apply_payment가 불일치 시 예외).
//    즉 **클라이언트가 보낸 금액은 어느 경로로도 DB에 닿지 않는다.**
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { quoteAmountKrw, periodFor, newOrderId, isPayablePlan, type BillingCycle } from "@/lib/billing/orders"
import { AUTO_BILLING_TERMS_VERSION } from "@/app/terms/billing/page"

export const runtime = "nodejs"

/** PG 자격증명이 주입됐는지. 없으면 결제창을 띄울 수 없으므로 'ready' 행도 만들지 않는다(고아 방지). */
export function isBillingConfigured(): boolean {
  return !!process.env.NICEPAY_CLIENT_KEY && !!process.env.NICEPAY_SECRET_KEY
}

/** 자동 갱신(빌링키) 사용 가능 여부. 나이스페이 별도 신청 승인 후 env로 켠다. */
export function isRecurringEnabled(): boolean {
  return isBillingConfigured() && process.env.NICEPAY_BILLING_ENABLED === "true"
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("로그인이 필요해요.", { status: 401 })

  const admin = createAdminClient()

  // 워크스페이스는 클라 값을 믿지 않고 서버가 판정한다(guest 제외 + created_at 명시 — budget.ts 관례).
  const { data: mem } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .neq("role", "guest")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  const wsId = mem?.workspace_id
  if (!wsId) return new Response("워크스페이스를 찾을 수 없어요.", { status: 404 })

  const { data: ws } = await admin.from("workspaces").select("owner_id").eq("id", wsId).maybeSingle()
  if (ws?.owner_id !== user.id) return new Response("관리자(대표)만 결제할 수 있어요.", { status: 403 })

  // ⚠️ plan/cycle만 받는다. amount는 받지 않는다(위 주석 ①).
  const body = (await req.json().catch(() => ({}))) as {
    plan?: string
    cycle?: string
    autoBillingConsent?: boolean
  }
  const plan = body.plan ?? ""
  const cycle = (body.cycle === "yearly" ? "yearly" : "monthly") as BillingCycle
  if (!isPayablePlan(plan)) return new Response("결제할 수 없는 요금제예요.", { status: 400 })

  // 자격증명이 없으면 결제창을 못 띄운다 → 여기서 끊어야 'ready' 고아 행이 안 생긴다.
  if (!isBillingConfigured()) {
    return new Response("결제 준비 중이에요. 조금만 기다려 주세요.", { status: 503 })
  }

  const amountKrw = quoteAmountKrw(plan, cycle) // ★서버 산출. 부가세 포함 총액.
  const { start, end } = periodFor(cycle)
  const orderId = newOrderId(wsId)

  const { error } = await admin.rpc("billing_start_checkout", {
    p_workspace_id: wsId,
    p_plan: plan,
    p_billing_cycle: cycle,
    p_seats: 0,
    p_amount_krw: amountKrw,
    p_order_id: orderId,
    p_period_start: start.toISOString(),
    p_period_end: end.toISOString(),
  })
  if (error) return new Response("결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.", { status: 500 })

  // 법적 의무① — 자동결제 약관 동의는 **자동 갱신을 실제로 켤 때** 의미가 있다.
  // 지금은 빌링키 미승인이라 자동 갱신이 불가능하므로, 동의를 받았을 때만 감사 로그에 남긴다.
  // (billing_record_consent는 구독 행이 아직 없어도 billing_events에 기록한다 — 그게 법적 증빙이다.)
  if (body.autoBillingConsent && isRecurringEnabled()) {
    await admin.rpc("billing_record_consent", {
      p_workspace_id: wsId,
      p_user_id: user.id,
      p_terms_version: AUTO_BILLING_TERMS_VERSION,
      p_payload: {
        order_id: orderId,
        user_agent: req.headers.get("user-agent") ?? null,
      },
    })
  }

  return Response.json({
    ok: true,
    orderId,
    amountKrw,
    plan,
    cycle,
    // 결제창 파라미터는 나이스페이 클라이언트키가 주입된 뒤 lib/billing/nicepay.ts에서 채운다.
    clientKey: process.env.NICEPAY_CLIENT_KEY,
    returnUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/billing/nicepay/return`,
  })
}
