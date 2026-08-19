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
// 규격 출처(2026-08-19 추가 확인):
//   · 거래조회(manual-status.php): POST https://webapi.nicepay.co.kr/webapi/inquery/trans_status.jsp
//     바디 TID·MID·EdiDate·SignData(+CharSet·EdiType) · SignData = **hex(sha256(TID + MID + EdiDate + MerchantKey))**
//     응답 ResultCode **0000**=조회성공 · **Status** 0=승인 / 1=취소 / 9=승인거래없음
//     ⚠️ **TID로만 조회된다.** 주문번호(Moid)로 찾는 API는 문서에 없다 → TID를 모르는
//        'ready' 고아 행은 조회로 대사할 수 없다(그래서 노티가 유일한 복구 경로다).
//     ⚠️ 응답에 **Amt(금액)가 없다.** 금액 대조는 우리가 못박은 ready 행과 billing_apply_payment가 한다.
//   · 결제통보/노티(manual-noti.php): 승인 완료 시 가맹점 URL로 통보. 파라미터 MID·MOID·TID·Amt·
//     ResultCode·StateCd(0 승인 / 1 전취소 / 2 후취소)·AuthDate 등.
//     ⚠️ **서명(Signature/SignData) 필드가 문서에 없다** → 서명검증이 불가능하다.
//        대신 "MID 일치 확인 + TID로 조회 API 재확인"으로 판정한다(더 강한 검증이다).
//     ⚠️ 수신 서버가 본문 **"OK"** 를 돌려주지 않으면 최대 **10회**(1~10분 간격) 재전송한다.
//     ⚠️ 통보 URL은 **가맹점관리자 > 가맹점정보**에서 등록해야 발송된다(코드만으로는 안 온다).
//
// ⚠️ **미확정**: 나이스페이에는 `clientKey/secretKey` + Basic 인증을 쓰는 REST 계열도 있다.
//    우리 상점이 어느 세대인지는 자격증명을 받아야 확정된다. 다르면 **이 파일만 교체**하면 되고
//    provider.ts 인터페이스·라우트·DB는 그대로다(그래서 경계를 뒀다).
//    담당자 확인 질문: "발급되는 게 MID+상점키(MerchantKey)입니까, clientKey/secretKey입니까?"
import crypto from "node:crypto"
import type { ApproveResult, BillingProvider, CheckoutParams, InquiryResult } from "./provider"
import { BillingUnsupportedError } from "./provider"

const sha256hex = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest("hex")

/** 거래조회 엔드포인트(승인·망취소는 결제창이 알려준 URL을 쓰므로 상수가 필요 없다). */
const INQUIRY_URL = "https://webapi.nicepay.co.kr/webapi/inquery/trans_status.jsp"

/**
 * 나이스페이 응답 파서. 응답은 JSON일 수도 key=value 폼일 수도 있어서(EdiType·연동세대에 따라
 * 다르다) 둘 다 받는다. 어느 쪽이든 실패하면 **빈 객체가 아니라 원문을 담아** 돌려준다 —
 * 파싱 실패를 "응답 없음"으로 오해하면 분쟁 시 증거가 사라진다.
 */
function parsePgResponse(text: string): Record<string, unknown> {
  try {
    const j = JSON.parse(text) as unknown
    if (j && typeof j === "object") return j as Record<string, unknown>
  } catch {
    // JSON이 아니면 form-encoded로 시도한다.
  }
  const kv = Object.fromEntries(new URLSearchParams(text))
  return Object.keys(kv).length > 0 ? kv : { _rawText: text }
}

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
        raw = parsePgResponse(await res.text())
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

    async inquire({ tid }): Promise<InquiryResult> {
      const ed = ediDate()
      let raw: Record<string, unknown> = {}
      try {
        const res = await fetch(INQUIRY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            TID: tid,
            MID: mid,
            EdiDate: ed,
            // 조회 서명 — 승인·결제창과 **또 순서가 다르다**(TID가 맨 앞). 문서 그대로.
            SignData: sha256hex(`${tid}${mid}${ed}${merchantKey}`),
            CharSet: "utf-8",
            EdiType: "JSON",
          }),
        })
        raw = parsePgResponse(await res.text())
      } catch (e) {
        return { ok: false, code: "NETWORK", message: e instanceof Error ? e.message : "조회 실패", raw }
      }

      const code = String(raw.ResultCode ?? "")
      if (code !== "0000") {
        // 조회 자체가 실패했다 = 승인 여부를 **모른다**. 이 경우 정산도 실패처리도 하지 않고
        // 다음 노티/크론에서 다시 시도해야 한다(모르는 상태를 '실패'로 굳히면 돈만 빠진다).
        return { ok: false, code, message: String(raw.ResultMsg ?? "조회 실패"), raw }
      }
      const status = String(raw.Status ?? "")
      return { ok: true, approved: status === "0", canceled: status === "1", raw }
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
