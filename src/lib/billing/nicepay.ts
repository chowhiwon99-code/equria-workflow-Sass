// 나이스페이 연동 — **PG 규격 의존 코드는 전부 이 파일 안에만 있다.**
//
// 규격 출처(2026-08-18 공식 문서 확인, developers.nicepay.co.kr/manual-auth.php):
//   · 결제창 SDK: https://pg-web.nicepay.co.kr/v3/common/js/nicepay-pgweb.js · `goPay(form)`
//   · 결제창 필수 파라미터: GoodsName · Amt · MID · EdiDate(YYYYMMDDHHMISS) · Moid · SignData · PayMethod · ReturnURL
//   · 결제창 SignData = **hex(sha256(EdiDate + MID + Amt + MerchantKey))**
//   · ReturnURL 수신(POST): AuthResultCode · AuthToken · TxTid · NextAppURL · NetCancelURL
//   · 승인 요청: NextAppURL로 POST · 바디 TID·AuthToken·MID·Amt·EdiDate·SignData·CharSet
//   · 승인 SignData = **hex(sha256(AuthToken + MID + Amt + EdiDate + MerchantKey))**
//   · 승인 응답 ResultCode: 카드 **3001** · 계좌이체 4000 · 가상계좌 4100
//
// ⚠️ **미확정**: 나이스페이에는 `clientKey/secretKey` + Basic 인증을 쓰는 REST 계열도 있다.
//    우리 상점이 어느 세대인지는 자격증명을 받아야 확정된다. 다르면 **이 파일만 교체**하면 되고
//    provider.ts 인터페이스·라우트·DB는 그대로다(그래서 경계를 뒀다).
//    담당자 확인 질문: "발급되는 게 MID+상점키(MerchantKey)입니까, clientKey/secretKey입니까?"
import crypto from "node:crypto"
import type { ApproveResult, BillingProvider, CheckoutParams } from "./provider"
import { BillingUnsupportedError } from "./provider"

const sha256hex = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest("hex")

/** YYYYMMDDHHMISS (KST). 서명에 들어가므로 결제창·승인에서 **같은 값**을 써야 한다. */
export function ediDate(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  return kst.toISOString().replace(/[-:T]/g, "").slice(0, 14)
}

export function createNicepayProvider(): BillingProvider {
  const mid = process.env.NICEPAY_MID ?? ""
  const merchantKey = process.env.NICEPAY_MERCHANT_KEY ?? ""
  const recurring = process.env.NICEPAY_BILLING_ENABLED === "true"

  if (!mid || !merchantKey) {
    // 자격증명이 없으면 만들지 않는다 — 호출부가 isBillingConfigured()로 먼저 걸러야 한다.
    throw new BillingUnsupportedError("결제")
  }

  return {
    name: "nicepay",
    capabilities: { recurring },

    buildCheckout({ orderId, amountKrw, goodsName, returnUrl }): CheckoutParams {
      const ed = ediDate()
      return {
        mid,
        moid: orderId,
        amt: amountKrw,
        goodsName,
        ediDate: ed,
        // 결제창 서명 — 문서 공식 그대로. 순서를 바꾸면 결제창이 뜨지 않는다.
        signData: sha256hex(`${ed}${mid}${amountKrw}${merchantKey}`),
        returnUrl,
      }
    },

    async approve({ nextAppUrl, authToken, tid, amountKrw }): Promise<ApproveResult> {
      const ed = ediDate()
      const body = new URLSearchParams({
        TID: tid,
        AuthToken: authToken,
        MID: mid,
        Amt: String(amountKrw),
        EdiDate: ed,
        // 승인 서명 — 결제창과 **순서가 다르다**(AuthToken이 앞).
        SignData: sha256hex(`${authToken}${mid}${amountKrw}${ed}${merchantKey}`),
        // 문서 기본 인코딩은 EUC-KR이다. 한글이 나오는 곳은 결과 메시지뿐이라 utf-8을 요청한다.
        // ⚠️ 실키로 한 번 확인할 것 — 거부되면 EUC-KR 디코딩을 넣어야 한다.
        CharSet: "utf-8",
      })

      let raw: Record<string, unknown> = {}
      try {
        const res = await fetch(nextAppUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        })
        const text = await res.text()
        try {
          raw = JSON.parse(text) as Record<string, unknown>
        } catch {
          raw = Object.fromEntries(new URLSearchParams(text))
        }
      } catch (e) {
        return { ok: false, code: "NETWORK", message: e instanceof Error ? e.message : "요청 실패", raw }
      }

      const code = String(raw.ResultCode ?? "")
      // 문서 확인값: 카드 3001 · 계좌이체 4000 · 가상계좌 4100. 그 외는 실패로 본다.
      if (!["3001", "4000", "4100"].includes(code)) {
        return { ok: false, code, message: String(raw.ResultMsg ?? "승인 실패"), raw }
      }
      return {
        ok: true,
        tid: String(raw.TID ?? tid),
        // ★PG가 말한 금액을 그대로 올린다. 우리 ready 행과의 대조는 billing_apply_payment가 한다.
        amountKrw: Number(raw.Amt ?? 0),
        method: (raw.PayMethod as string) ?? null,
        approvedAt: new Date().toISOString(),
        raw,
      }
    },

    async netCancel({ netCancelUrl, authToken, tid, amountKrw }): Promise<boolean> {
      const ed = ediDate()
      try {
        const res = await fetch(netCancelUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            TID: tid,
            AuthToken: authToken,
            MID: mid,
            Amt: String(amountKrw),
            EdiDate: ed,
            SignData: sha256hex(`${authToken}${mid}${amountKrw}${ed}${merchantKey}`),
            NetCancel: "1",
            CharSet: "utf-8",
          }),
        })
        return res.ok
      } catch {
        return false
      }
    },
  }
}
