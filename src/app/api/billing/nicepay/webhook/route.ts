// 나이스페이 결제통보(노티) 수신 — **승인 응답을 우리가 못 받았을 때의 유일한 복구 경로.**
//
// 왜 필요한가:
//   /api/billing/nicepay/return이 승인 API를 호출하는 도중 응답이 유실되면(타임아웃·502)
//   나이스페이 쪽은 승인 완료인데 우리는 실패로 닫는다 = **고객 돈만 빠지고 서비스는 안 열린다.**
//   나이스페이는 승인이 끝나면 가맹점 URL로 결과를 통보하는데, 그게 이 라우트다.
//   마이그141이 billing_apply_payment에 'failed' → 'paid' 복구를 열어둔 것도 이 경로 때문이다.
//
// 🔴 본문을 절대 믿지 않는다.
//   규격 확인 결과(developers.nicepay.co.kr/manual-noti.php, 2026-08-19) **노티에는 서명 필드가
//   없다.** 즉 서명검증이 불가능하다. 그래서 다음 3단으로 판정한다 — 서명보다 강한 검증이다.
//     ① MID가 우리 것인지 확인 (남의 트래픽·장난 요청 차단)
//     ② 주문번호(MOID)로 **우리가 만든 ready 행**을 찾는다 (모르는 주문은 처리하지 않는다)
//     ③ TID로 **조회 API를 다시 때려** 승인(Status='0') 확인 — 이게 유일한 신뢰 소스
//   금액은 본문의 Amt를 그대로 RPC에 넘기지만, RPC가 **checkout 때 못박은 금액과 대조**해
//   다르면 예외를 던진다. 즉 본문 금액을 위조해도 정산되지 않는다.
//
// 🔴 응답은 반드시 본문 "OK".
//   규격: OK를 받을 때까지 **최대 10회**(1~10분 간격) 재전송한다.
//   - 처리했거나 / 우리 것이 아니거나 / 처리할 게 없으면 → "OK"로 닫는다(무한 재전송 방지).
//   - **우리 쪽 일시적 장애로 판정을 못 한 경우엔 OK를 주지 않는다** → 재전송이 곧 재시도다.
//     (BILLING-PLAN의 "항상 200" 지침에서 의도적으로 벗어난 부분이다. 재전송이 10회로
//      묶여 있다는 걸 규격에서 확인했으므로 폭주 위험이 없고, 오히려 공짜 재시도를 버릴 이유가 없다.)
//
// ⚠️ 이 라우트는 나이스페이 **상점관리자 > 개발정보 > 웹훅(URL 통보)**에 등록해야 호출된다.
//    코드만 배포해서는 노티가 오지 않는다. ✅ 2026-08-22 등록 완료(결제수단 4종 전부 체크).
//    ⚠️ 같은 화면의 **IP보안(REST API 접근제한)은 비워둘 것** — Vercel은 아웃바운드 IP가
//    고정이 아니라 등록하면 승인 요청이 통째로 막힌다.
// ⚠️ proxy.ts OPEN_PATHS에 "/api/billing/nicepay"가 있어야 한다. 없으면 세션 쿠키가 없는
//    서버간 요청이 /login으로 리다이렉트돼 조용히 전부 실패한다.
import { createAdminClient } from "@/lib/supabase/admin"
import { createNicepayProvider } from "@/lib/billing/nicepay"
import { toJson } from "@/lib/billing/provider"
import { isBillingConfigured } from "@/app/api/billing/checkout/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** 나이스페이가 기대하는 성공 응답. 이 문자열이 아니면 재전송된다. */
function ok() {
  return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
/** 판정 실패 — OK를 주지 않아 나이스페이가 다시 보내게 한다(최대 10회). */
function retryLater(reason: string) {
  console.error("[billing/webhook] retry-later:", reason)
  return new Response("RETRY", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
}

/** Content-Type이 문서에 없어서 form·JSON 둘 다 받는다. */
async function readParams(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? ""
  if (ct.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v ?? "")]))
  }
  const form = await req.formData().catch(() => null)
  if (!form) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of form.entries()) out[k] = typeof v === "string" ? v : ""
  return out
}

export async function POST(req: Request) {
  if (!isBillingConfigured()) {
    // 자격증명이 없으면 조회 API를 부를 수 없다 = 판정 불가.
    // 이 상태에서 노티가 올 일은 없지만(결제 자체가 안 되므로), 온다면 재시도시키는 게 맞다.
    return retryLater("credentials_missing")
  }

  const p = await readParams(req)
  // 필드명은 REST 규격(camelCase)이 기본이고, 옛 결제창 규격(MOID·TID·StateCd)도 같이 받는다 —
  // 통보 형식을 문서가 단정하지 않아서, 한쪽만 읽으면 통보를 통째로 무시하게 된다(조용한 실패).
  const moid = p.orderId ?? p.MOID ?? p.Moid ?? ""
  const tid = p.tid ?? p.TID ?? p.TxTid ?? ""
  const status = p.status ?? ""
  const stateCd = p.StateCd ?? p.State ?? ""
  const amt = Number(p.amount ?? p.Amt ?? 0)

  // ① 발신자 확인 — REST 규격은 clientId를 준다(옛 MID 자리). 값이 오는데 우리 것이 아니면
  //    우리 트래픽이 아니므로 재전송시킬 이유가 없다. **필드가 아예 없으면 통과시킨다** —
  //    통보 규격이 불확실한데 여기서 막으면 정상 통보까지 버리게 되고, 실제 방어선은
  //    아래 ②(우리가 만든 주문인지)와 ③(조회 API 재확인)이다.
  const senderId = p.clientId ?? p.MID ?? p.Mid ?? ""
  if (senderId && senderId !== process.env.NICEPAY_CLIENT_KEY) {
    console.warn("[billing/webhook] sender mismatch")
    return ok()
  }
  if (!moid || !tid) {
    console.warn("[billing/webhook] missing moid/tid")
    return ok()
  }

  const admin = createAdminClient()

  // ② 우리가 만든 주문인지. 모르는 주문번호는 처리하지 않는다.
  const { data: pay, error: payErr } = await admin
    .from("billing_payments")
    .select("workspace_id, status, amount_krw")
    .eq("order_id", moid)
    .maybeSingle()
  if (payErr) return retryLater(`db:${payErr.message}`)
  if (!pay) {
    console.warn("[billing/webhook] unknown order:", moid)
    return ok()
  }

  // ── 취소 통보(StateCd 1=전취소 · 2=후취소). 상점관리자에서 환불 처리한 경우가 대표적이다. ──
  //
  // 🔴 여기서도 **본문을 믿지 않는다.** 이건 승인 통보보다 오히려 더 위험하다 —
  //    주문번호만 알면 가짜 취소 통보로 **돈 낸 고객을 무료로 강등**시킬 수 있기 때문이다.
  //    (발신자 확인은 clientId 필드가 없으면 통과시키므로 방어선이 되지 못한다.)
  //    그래서 TID로 조회 API를 때려 "정말 취소된 거래인가"를 확인한 뒤에만 반영한다.
  //
  // 2026-08-21 변경: 예전에는 감사 로그만 남기고 요금제를 그대로 뒀다. 환불 금액 계산
  // (`lib/billing/refund.ts`, 법적 의무④)이 없어 반쪽짜리가 되기 때문이었는데, 그게 생겨서 짝이 맞았다.
  // 이제 billing_apply_cancellation(마이그142)이 영수증·구독 종료·요금제 강등을 한 트랜잭션으로 처리한다.
  if (stateCd === "1" || stateCd === "2" || status === "cancelled" || status === "partialCancelled") {
    const inq = await createNicepayProvider().inquire({ tid })
    if (!inq.ok) {
      // 취소 여부를 **모른다**. 멀쩡한 유료 고객을 강등시킬 수는 없으니 재전송받아 다시 판정한다.
      return retryLater(`cancel_inquiry:${inq.code}:${inq.message}`)
    }
    // 🔴 tid가 정말 이 주문(moid)의 거래인지 대조한다. tid는 "취소된 거래인가"만 증명하고
    //    "그 취소가 이 주문의 취소인가"는 증명하지 않는다 — 대조 없이 반영하면 공격자가
    //    자기 자신의(무관한) 취소 거래 tid로 남의 주문번호를 지정해 위조 통보를 보낼 수 있다.
    // ⚠️ orderId가 null(=조회 응답에 필드가 없음)이면 "불일치"가 아니라 "모른다"다 — 매뉴얼상
    //    필수 필드라 정상이면 항상 오지만, 혹시라도 빠지면 재전송받아 다시 판정한다(적대검증 발견).
    //    실제로 다른 주문임이 확인된 경우에만 거부한다.
    if (inq.orderId === null) {
      return retryLater("cancel_inquiry:missing_order_id")
    }
    if (inq.orderId !== moid) {
      console.warn("[billing/webhook] tid/order mismatch on cancel:", { moid, tid, inqOrderId: inq.orderId })
      // ⚠️ 원본 조회응답(inq.raw)은 **공격자 자신의** 무관한 거래 정보(구매자명·카드사 등 PII 가능)다.
      //    피해자 워크스페이스 로그에 그대로 남기면 공격자 정보가 남의 감사로그에 섞인다(적대검증 발견) —
      //    식별에 필요한 최소 필드만 남긴다.
      await admin.from("billing_events").insert({
        workspace_id: pay.workspace_id,
        kind: "webhook_received",
        payload: { order_id: moid, tid, note: "order_mismatch", inquiry_order_id: inq.orderId },
      })
      return ok()
    }
    if (!inq.canceled) {
      // 조회해보니 취소된 거래가 아니다 = 통보가 틀렸거나 위조다. 기록만 남기고 아무것도 바꾸지 않는다.
      await admin.from("billing_events").insert({
        workspace_id: pay.workspace_id,
        kind: "webhook_received",
        payload: { order_id: moid, tid, note: "cancel_not_confirmed", inquiry: toJson(inq.raw) },
      })
      return ok()
    }

    const { data: result, error } = await admin.rpc("billing_apply_cancellation", {
      p_order_id: moid,
      p_tid: tid,
      // 조회 API가 말한 **누적 취소 금액**. 못 읽으면 null → RPC가 전액 취소로 본다.
      p_canceled_amount_krw: inq.canceledAmountKrw ?? undefined,
      p_canceled_at: new Date().toISOString(),
      p_raw: toJson({ source: "noti_cancel", body: p, inquiry: inq.raw }),
    })
    if (error) {
      // 일시적 DB 오류일 수 있다 → 재전송받아 다시 시도한다(취소 반영을 놓치면 공짜 이용이 남는다).
      await admin.from("billing_events").insert({
        workspace_id: pay.workspace_id,
        kind: "webhook_received",
        payload: { order_id: moid, tid, note: "cancel_error", error: error.message },
      })
      return retryLater(`cancel_apply:${error.message}`)
    }

    await admin.from("billing_events").insert({
      workspace_id: pay.workspace_id,
      kind: "webhook_received",
      payload: { order_id: moid, tid, state_cd: stateCd, note: "cancel_applied", result },
    })
    return ok()
  }

  // 이미 정산된 주문이면 재통보다. 조회 API를 또 때릴 필요 없다.
  if (pay.status === "paid") return ok()

  // ③ 🔴 최종 판정 — 본문이 아니라 조회 API에 묻는다.
  const provider = createNicepayProvider()
  const inq = await provider.inquire({ tid })
  if (!inq.ok) {
    // 승인 여부를 **모르는** 상태다. 실패로 굳히면 돈만 빠진다 → 재전송받아 다시 판정한다.
    return retryLater(`inquiry:${inq.code}:${inq.message}`)
  }
  // 🔴 위 취소 분기와 같은 이유로 대조한다 — tid가 승인 거래인 것과 "이 주문(moid)의 승인
  //    거래인 것"은 별개다. 대조 없이 정산하면 자신의 승인 거래 tid로 남의 order_id를 지정한
  //    위조 통보가 그대로 billing_apply_payment까지 도달한다.
  // ⚠️ null은 "불일치"가 아니라 "모른다"다 — 특히 이 통보는 **첫 결제(CPL-)의 유일한 복구
  //    경로**라 여기서 잘못 거부하면 승인은 됐는데 서비스가 영영 안 열릴 수 있다(적대검증 발견).
  if (inq.orderId === null) {
    return retryLater("inquiry:missing_order_id")
  }
  if (inq.orderId !== moid) {
    console.warn("[billing/webhook] tid/order mismatch on settle:", { moid, tid, inqOrderId: inq.orderId })
    // ⚠️ inq.raw는 공격자 자신의 무관한 거래 정보(PII 가능) — 피해자 로그에 그대로 남기지 않는다.
    await admin.from("billing_events").insert({
      workspace_id: pay.workspace_id,
      kind: "webhook_received",
      payload: { order_id: moid, tid, note: "order_mismatch", inquiry_order_id: inq.orderId },
    })
    return ok()
  }
  if (!inq.approved) {
    // 승인된 거래가 아니다(취소됨·승인거래없음). 정산하지 않고 기록만 남긴다.
    await admin.from("billing_events").insert({
      workspace_id: pay.workspace_id,
      kind: "webhook_received",
      payload: { order_id: moid, tid, note: "not_approved", inquiry: toJson(inq.raw) },
    })
    return ok()
  }

  // 정산. 금액 대조·멱등성은 RPC가 책임진다(이미 paid면 'already', 금액 다르면 예외).
  const { data: applied, error } = await admin.rpc("billing_apply_payment", {
    p_order_id: moid,
    p_tid: tid,
    p_amount_krw: amt,
    p_approved_at: new Date().toISOString(),
    p_raw: toJson({ source: "noti", body: p, inquiry: inq.raw }),
  })

  if (error) {
    // 금액 불일치(위변조 의심)는 재시도해도 결과가 같다 → OK로 닫고 감사 로그만 남긴다.
    // 그 외(일시적 DB 오류)는 재전송받아 다시 시도한다.
    const permanent = /amount mismatch|unknown order|expected ready/.test(error.message)
    await admin.from("billing_events").insert({
      workspace_id: pay.workspace_id,
      kind: "webhook_received",
      payload: { order_id: moid, tid, note: "settle_error", permanent, error: error.message },
    })
    return permanent ? ok() : retryLater(`settle:${error.message}`)
  }

  await admin.from("billing_events").insert({
    workspace_id: pay.workspace_id,
    kind: "webhook_received",
    payload: { order_id: moid, tid, amount_krw: amt, result: applied },
  })
  return ok()
}

/**
 * 통보 URL이 살아 있는지 확인하는 용도(나이스페이 관리자 등록 시 접근 확인).
 * 결제 정보를 노출하지 않고 200만 돌려준다.
 */
export function GET() {
  return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
