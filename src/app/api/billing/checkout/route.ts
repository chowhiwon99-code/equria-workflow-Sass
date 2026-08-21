// 구독 시작 — 카드정보를 받아 **빌키를 발급하고 첫 결제까지** 한 번에 끝내는 지점.
//
// 🔴 이 라우트의 존재 이유가 금액 위변조 방어다(한국 PG 사고 1순위).
//    흐름을 이렇게 고정한다:
//      ① 클라는 **plan/cycle + 카드정보만** 보낸다. 금액은 절대 받지 않는다.
//      ② 서버가 quoteAmountKrw()로 금액을 산출한다(plans.ts를 읽는 유일한 함수).
//      ③ billing_start_checkout이 그 금액을 'ready' 행에 못박는다.
//      ④ 빌키 승인 응답의 금액을 ③과 대조한다(billing_apply_payment가 불일치 시 예외).
//    즉 **클라이언트가 보낸 금액은 어느 경로로도 DB에 닿지 않는다.**
//
// 🔴 카드 원문 취급 규칙 (나이스페이 포스타트는 결제창이 아니라 가맹점 카드입력창을 쓴다)
//    · 이 라우트의 메모리에만 존재하고, provider.issueBillingKey()의 암호화 직전에 소멸한다.
//    · **DB·로그·에러 메시지·PG raw 저장 어디에도 남기지 않는다.** 남기는 건 bid와 끝 4자리뿐.
//    · 응답 본문에도 절대 되돌려주지 않는다.
//
// 🔴 승인은 됐는데 우리 정산이 실패하면 **돈만 빠지고 서비스는 안 열린다.**
//    그 경우 즉시 provider.cancel()로 되돌린다(옛 망취소의 역할).
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  quoteAmountKrw,
  periodFor,
  newOrderId,
  isPayablePlan,
  goodsNameFor,
  type BillingCycle,
} from "@/lib/billing/orders"
import { createNicepayProvider } from "@/lib/billing/nicepay"
import { toJson, type CardInput } from "@/lib/billing/provider"
import { getUserWorkspaceId } from "@/lib/workspace"
import { AUTO_BILLING_TERMS_VERSION } from "@/app/terms/billing/page"

export const runtime = "nodejs"

/** PG 자격증명이 주입됐는지. 없으면 결제를 시작할 수 없으므로 'ready' 행도 만들지 않는다(고아 방지). */
export function isBillingConfigured(): boolean {
  return !!process.env.NICEPAY_CLIENT_KEY && !!process.env.NICEPAY_SECRET_KEY
}

/**
 * 자동 갱신(빌키) 사용 가능 여부.
 * 포스타트는 빌키가 기본 제공이라 자격증명만 있으면 켜진다(옛 별도 신청 스위치 제거).
 */
export function isRecurringEnabled(): boolean {
  return isBillingConfigured()
}

/** 카드 입력 검증 — 형식이 틀리면 PG를 부르기 전에 끊는다(불필요한 실패 거래 방지). */
function parseCard(v: unknown): CardInput | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  const digits = (x: unknown) => String(x ?? "").replace(/\D/g, "")
  const cardNo = digits(o.cardNo)
  const expYear = digits(o.expYear).slice(-2)
  const expMonth = digits(o.expMonth).padStart(2, "0")
  const idNo = digits(o.idNo)
  const cardPw = digits(o.cardPw)

  if (cardNo.length < 15 || cardNo.length > 16) return null
  if (expYear.length !== 2) return null
  if (expMonth.length !== 2 || Number(expMonth) < 1 || Number(expMonth) > 12) return null
  // 생년월일 6자리(개인) 또는 사업자번호 10자리(법인)
  if (idNo.length !== 6 && idNo.length !== 10) return null
  if (cardPw.length !== 2) return null

  return { cardNo, expYear, expMonth, idNo, cardPw }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("로그인이 필요해요.", { status: 401 })

  const admin = createAdminClient()

  // 🔴 결제 대상 회사는 **지금 화면에서 보고 있는 회사**여야 한다.
  //    이전 구현은 "가장 오래된 멤버십"을 골랐다. 여러 회사에 속한 오너(대표가 그렇다)가
  //    B사 화면에서 결제해도 A사가 결제되는 실제 사고가 났다(2026-08-20 실결제에서 확인).
  //    getUserWorkspaceId()가 활성 워크스페이스 쿠키를 우선하고, **내 비게스트 멤버십일 때만**
  //    인정한다(스푸핑 방지). 쿠키가 없으면 기존과 같이 첫 멤버십으로 폴백한다.
  const wsId = await getUserWorkspaceId(admin, user.id)
  if (!wsId) return new Response("워크스페이스를 찾을 수 없어요.", { status: 404 })

  const { data: ws } = await admin.from("workspaces").select("owner_id").eq("id", wsId).maybeSingle()
  if (ws?.owner_id !== user.id) return new Response("관리자(대표)만 결제할 수 있어요.", { status: 403 })

  // ⚠️ plan/cycle/card만 받는다. amount는 받지 않는다(위 주석 ①).
  const body = (await req.json().catch(() => ({}))) as {
    plan?: string
    cycle?: string
    autoBillingConsent?: boolean
    card?: unknown
  }
  const plan = body.plan ?? ""
  const cycle = (body.cycle === "yearly" ? "yearly" : "monthly") as BillingCycle
  if (!isPayablePlan(plan)) return new Response("결제할 수 없는 요금제예요.", { status: 400 })

  // 법적 의무① — 자동결제는 회원가입 약관과 **별도로** 사전 동의를 받아야 한다.
  // 이제 실제로 자동 갱신이 켜지므로 동의 없이는 진행하지 않는다.
  if (!body.autoBillingConsent) {
    return new Response("자동결제 약관에 동의해 주세요.", { status: 400 })
  }

  const card = parseCard(body.card)
  if (!card) return new Response("카드 정보를 다시 확인해 주세요.", { status: 400 })

  // 자격증명이 없으면 PG를 못 부른다 → 여기서 끊어야 'ready' 고아 행이 안 생긴다.
  if (!isBillingConfigured()) {
    return new Response("결제 준비 중이에요. 조금만 기다려 주세요.", { status: 503 })
  }

  const amountKrw = quoteAmountKrw(plan, cycle) // ★서버 산출. 부가세 포함 총액.
  const { start, end } = periodFor(cycle)
  const orderId = newOrderId(wsId)
  // 상품명은 갱신 청구와 **같은 문구**여야 카드 명세서에서 같은 구독으로 읽힌다(orders.ts SSOT).
  const goodsName = goodsNameFor(plan, cycle)

  // ③ 금액을 'ready' 행에 못박는다.
  const { error: startErr } = await admin.rpc("billing_start_checkout", {
    p_workspace_id: wsId,
    p_plan: plan,
    p_billing_cycle: cycle,
    p_seats: 0,
    p_amount_krw: amountKrw,
    p_order_id: orderId,
    p_period_start: start.toISOString(),
    p_period_end: end.toISOString(),
  })
  if (startErr) return new Response("결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.", { status: 500 })

  // 법적 의무① 증빙 — 구독 행이 아직 없어도 billing_events에 남는다(그게 법적 증빙이다).
  await admin.rpc("billing_record_consent", {
    p_workspace_id: wsId,
    p_user_id: user.id,
    p_terms_version: AUTO_BILLING_TERMS_VERSION,
    p_payload: { order_id: orderId, user_agent: req.headers.get("user-agent") ?? null },
  })

  const provider = createNicepayProvider()

  // ── 빌키 발급 (카드 원문이 존재하는 유일한 구간) ──
  const last4 = card.cardNo.slice(-4)
  const issued = await provider.issueBillingKey({
    orderId,
    card,
    buyerName: user.user_metadata?.name ? String(user.user_metadata.name) : null,
    buyerEmail: user.email ?? null,
  })
  if (!issued.ok) {
    await admin.rpc("billing_fail_payment", {
      p_order_id: orderId,
      p_reason: `billingkey:${issued.code}`,
      p_raw: toJson(issued.raw),
    })
    return new Response("카드 등록에 실패했어요. 카드 정보를 확인하거나 다른 카드를 사용해 주세요.", { status: 402 })
  }

  // 빌키 저장 — service_role로 직접 넣는다. 단일 행이라 원자성 요구가 없어 RPC를 두지 않았다
  // (billing_keys는 RLS 정책 0개 = 브라우저에서 절대 못 읽는다. 그래서 구독 테이블과 분리돼 있다).
  // 같은 워크스페이스의 이전 빌키는 revoked로 내린다 — 카드 교체 시 옛 카드로 청구되면 안 된다.
  await admin
    .from("billing_keys")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("workspace_id", wsId)
    .eq("status", "active")
  await admin.from("billing_keys").insert({
    workspace_id: wsId,
    provider: "nicepay",
    bid: issued.bid,
    card_brand: issued.cardName,
    card_last4: last4, // ★카드번호 전체는 어디에도 저장하지 않는다.
    status: "active",
  })

  // ── 첫 결제 (매달 갱신도 완전히 같은 경로를 쓴다) ──
  const charged = await provider.charge({ bid: issued.bid, orderId, amountKrw, goodsName })
  if (!charged.ok) {
    await admin.rpc("billing_fail_payment", {
      p_order_id: orderId,
      p_reason: `charge:${charged.code}`,
      p_raw: toJson(charged.raw),
    })
    return new Response("결제에 실패했어요. 카드 한도나 정보를 확인해 주세요.", { status: 402 })
  }

  // ── 정산(원자 처리): 영수증·구독·plan 승급·사용량 재설정·감사로그 ──
  const { error: applyErr } = await admin.rpc("billing_apply_payment", {
    p_order_id: orderId,
    p_tid: charged.tid,
    p_amount_krw: charged.amountKrw, // ★PG가 말한 금액. ready 행과 다르면 RPC가 예외를 던진다.
    p_approved_at: charged.approvedAt,
    p_raw: toJson(charged.raw),
  })
  if (applyErr) {
    // 🔴 승인은 됐는데 정산이 실패했다 = 돈만 빠진 상태. 즉시 되돌린다.
    const reverted = await provider.cancel({
      tid: charged.tid,
      orderId,
      reason: "정산 실패 자동 취소",
      amountKrw: charged.amountKrw,
    })
    await admin.rpc("billing_fail_payment", {
      p_order_id: orderId,
      p_reason: `apply:${applyErr.message}${reverted ? "" : " (자동취소 실패 — 수동 확인 필요)"}`,
      p_raw: toJson({ apply_error: applyErr.message, reverted }),
    })
    return new Response("결제 처리 중 문제가 생겨 자동으로 취소했어요. 잠시 후 다시 시도해 주세요.", { status: 500 })
  }

  // 🔴 자동 갱신을 **여기서** 켠다. 구독 행은 방금 billing_apply_payment가 처음 만들었기 때문이다.
  //    위쪽 billing_record_consent는 결제 **전에** 부르는데(사전 동의가 법적 요건이라 순서를 못 바꾼다),
  //    그 시점엔 구독 행이 아직 없어 RPC 안의 UPDATE가 0행을 건드리고 끝난다.
  //    → 2026-08-20 실결제에서 동의를 받고도 auto_renew=false·consent_auto_billing_at=null로 남았다.
  //      그 상태로 두면 다음 달에 아무도 청구하지 않아 past_due → free로 강등된다.
  //    동의 증빙(billing_events)은 결제 전 시각 그대로 남아 있고, 여기서는 구독 행에 반영만 한다.
  const { error: renewErr } = await admin
    .from("billing_subscriptions")
    .update({
      auto_renew: true,
      // 청구 판정은 current_period_end가 하고(renew.ts), 이 값은 7일 전 고지의 날짜·문구에 쓰인다.
      next_charge_at: end.toISOString(),
      consent_auto_billing_at: new Date().toISOString(),
      consent_terms_version: AUTO_BILLING_TERMS_VERSION,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", wsId)
  if (renewErr) {
    // 결제 자체는 끝났다 — 실패로 응답하면 안 된다(고객은 돈을 냈고 서비스도 열렸다).
    // 자동 갱신만 안 켜진 상태이고, 다음 달 청구가 없으면 유예 후 만료된다(안전한 방향).
    console.error("[billing/checkout] auto_renew 설정 실패:", wsId, renewErr.message)
  }

  return Response.json({
    ok: true,
    orderId,
    amountKrw,
    plan,
    cycle,
    cardLast4: last4,
    cardName: issued.cardName,
    receiptUrl: charged.receiptUrl,
  })
}
