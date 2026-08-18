// 결제창 인증 결과 수신 → **서버가 직접 승인 API를 호출** → 정산.
//
// 🔴 신뢰 소스는 이 라우트가 받은 POST 값이 아니라 **우리가 호출한 승인 API 응답**이다.
//    리턴 값은 브라우저가 보내는 것이라 금액·플랜 위조가 가능하다. 여기서는 승인에 필요한
//    핸들(AuthToken·NextAppURL·TID)만 꺼내 쓰고, 금액 판정은 billing_apply_payment가
//    **우리가 미리 못박은 ready 행**과 대조해서 한다.
//
// 🔴 망취소가 이 파일의 존재 이유 중 절반이다.
//    승인은 성공했는데 정산(RPC)이 실패하면 **고객 돈만 빠지고 서비스는 안 열린다.**
//    그 경우 즉시 NetCancelURL로 승인을 되돌린다. 금액 불일치(위변조)가 대표 사례다.
import { createAdminClient } from "@/lib/supabase/admin"
import { createNicepayProvider } from "@/lib/billing/nicepay"
import { toJson } from "@/lib/billing/provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** 결과 화면으로 보낸다. 결제창은 별도 창/리디렉트라 사용자에겐 페이지 이동이 자연스럽다. */
function redirect(to: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ""
  return Response.redirect(`${base}${to}`, 303)
}

export async function POST(req: Request) {
  // 나이스페이는 form-encoded로 POST한다.
  const form = await req.formData().catch(() => null)
  if (!form) return redirect("/billing?result=fail&reason=bad_request")

  const get = (k: string) => (form.get(k) as string | null) ?? ""
  const authResultCode = get("AuthResultCode")
  const authToken = get("AuthToken")
  const tid = get("TxTid") || get("TID")
  const nextAppUrl = get("NextAppURL")
  const netCancelUrl = get("NetCancelURL")
  const moid = get("Moid") || get("MOID") // 우리 주문번호(order_id)

  const admin = createAdminClient()

  // 인증 단계에서 이미 실패했거나 승인 핸들이 없으면 승인 자체가 불가능하다.
  if (!authToken || !nextAppUrl || !moid) {
    if (moid) await admin.rpc("billing_fail_payment", { p_order_id: moid, p_reason: `auth:${authResultCode}` })
    return redirect("/billing?result=fail&reason=auth")
  }

  // 우리 ready 행에서 **우리가 못박은 금액**을 가져온다. 승인 요청 금액은 이 값을 쓴다.
  // workspace_id도 여기서 같이 가져온다 — 아래 오류 경로에서 다시 조회하면서 `!`로 단언하면
  // 그 사이 행이 사라졌을 때 **원래 실패 원인을 덮고 크래시**한다(감사 로그도 못 남긴다).
  const { data: pay } = await admin
    .from("billing_payments")
    .select("amount_krw, status, workspace_id")
    .eq("order_id", moid)
    .maybeSingle()
  if (!pay) return redirect("/billing?result=fail&reason=unknown_order")
  if (pay.status === "paid") return redirect("/billing?result=ok") // 이미 처리됨(뒤로가기 등)

  const provider = createNicepayProvider()
  const approved = await provider.approve({
    nextAppUrl,
    authToken,
    tid,
    amountKrw: pay.amount_krw, // ★클라가 보낸 Amt가 아니라 우리 금액으로 승인을 요청한다
  })

  if (!approved.ok) {
    await admin.rpc("billing_fail_payment", {
      p_order_id: moid,
      p_reason: `${approved.code}:${approved.message}`.slice(0, 200),
      p_raw: toJson(approved.raw),
    })
    return redirect("/billing?result=fail&reason=declined")
  }

  // 승인 성공 → 정산(요금제 승급·사용량 반영·감사로그가 한 트랜잭션으로 돈다).
  const { error } = await admin.rpc("billing_apply_payment", {
    p_order_id: moid,
    p_tid: approved.tid,
    p_amount_krw: approved.amountKrw, // PG가 말한 금액. ready 행과 다르면 RPC가 예외를 던진다.
    p_approved_at: approved.approvedAt,
    p_raw: toJson(approved.raw),
  })

  if (error) {
    // 🔴 여기가 제일 위험한 지점 — 돈은 빠졌는데 서비스는 안 열린 상태다. 즉시 되돌린다.
    const reverted = netCancelUrl
      ? await provider.netCancel({ netCancelUrl, authToken, tid: approved.tid, amountKrw: approved.amountKrw })
      : false
    await admin.from("billing_events").insert({
      workspace_id: pay.workspace_id,
      kind: "renew_failed",
      payload: { order_id: moid, tid: approved.tid, settle_error: error.message, net_canceled: reverted },
    })
    return redirect(`/billing?result=fail&reason=${reverted ? "reverted" : "settle_error"}`)
  }

  return redirect("/billing?result=ok")
}
