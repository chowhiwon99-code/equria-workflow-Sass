// 나이스페이 연동 — **PG 규격 의존 코드는 전부 이 파일 안에만 있다.**
//
// 규격 출처: https://github.com/nicepayments/nicepay-manual (2026-08-20 확인)
//   + 나이스페이 포스타트 담당자 회신(2026-08-20):
//     "포스타트에서는 홈페이지 연동 시 MID가 아닌 클라이언트키/시크릿키 통하여 연동이 가능합니다."
//     "빌키 발급/승인/삭제 부분만 개발가이드로 안내드리고 있어, 그 외 상품 구축, 자동결제 기능,
//      카드정보입력창 등은 귀사에서 직접 개발 및 구축해주셔야 합니다."
//
// ⚠️ **2026-08-20 전면 교체**: 이전 구현은 `MID + 상점키 + SignData(sha256)`를 쓰는 옛 결제창(PG Web)
//    규격이었다. 실제 우리 상점은 REST 계열이고 정기결제는 결제창을 쓰지 않는다 → 통째로 갈았다.
//    provider.ts의 경계 덕분에 라우트·DB·RPC는 그대로다.
//
// 확정 규격
//   · 호스트: https://api.nicepay.co.kr
//   · 인증:   Authorization: Basic base64(clientKey:secretKey)   (Access Token 방식은 30분 만료·갱신
//             불가라 서버리스에 부적합해 상점 설정에서 Basic 인증을 택했다)
//   · 빌키발급: POST /v1/subscribe/regist          바디 { encData, orderId, encMode, buyer* }
//   · 빌키승인: POST /v1/subscribe/{bid}/payments  바디 { orderId, amount, goodsName, cardQuota, useShopInterest }
//   · 빌키삭제: POST /v1/subscribe/{bid}/expire    바디 { orderId }
//   · 승인취소: POST /v1/payments/{tid}/cancel     바디 { orderId, reason }
//   · 거래조회: GET  /v1/payments/{tid}
//   · 거래조회(주문번호): GET /v1/payments/find/{orderId}?orderDate=YYYYMMDD  ← 중복청구 방지의 핵심
//   · 성공 판정: resultCode === "0000"  (옛 규격의 3001/4000/4100이 아니다)
//
// encData(카드 암호화)
//   평문: `cardNo=...&expYear=YY&expMonth=MM&idNo=YYMMDD&cardPw=12`  (순서·구분자 그대로)
//   AES-256: AES/CBC/PKCS5Padding · key=시크릿키 전체(32byte) · IV=시크릿키 앞 16자 · Hex · encMode="A2"
//   AES-128: AES/ECB/PKCS5Padding · key=시크릿키 앞 16자 · Hex        (encMode 생략)
//   → **AES-256(CBC)을 쓴다.** ECB는 같은 평문이 같은 암호문이 되어 카드정보에 부적합하다.
//     시크릿키가 32자가 아닌 경우에만 AES-128로 떨어진다(문서 예시는 32자).
import crypto from "node:crypto"
import type {
  BillingKeyResult,
  BillingProvider,
  CardInput,
  ChargeResult,
  InquiryResult,
} from "./provider"
import { BillingUnsupportedError } from "./provider"

const API_BASE = "https://api.nicepay.co.kr"

/**
 * 나이스페이 응답 파서. JSON이 정상이지만, 장애 시 HTML 에러 페이지가 오는 경우가 있어
 * 실패해도 **빈 객체가 아니라 원문을 담아** 돌려준다 — 파싱 실패를 "응답 없음"으로 오해하면
 * 분쟁 시 증거가 사라진다.
 */
function parsePgResponse(text: string): Record<string, unknown> {
  try {
    const j = JSON.parse(text) as unknown
    if (j && typeof j === "object") return j as Record<string, unknown>
  } catch {
    // JSON이 아니면 아래에서 원문을 담는다.
  }
  return { _rawText: text.slice(0, 2000) }
}

/**
 * 카드 원문을 나이스페이 규격으로 암호화한다.
 *
 * 🔴 이 함수가 카드 원문을 만지는 **유일한 지점**이다. 반환값(encData)만 밖으로 나가고
 *    평문은 여기서 끝난다. 절대 로그를 찍지 말 것.
 */
function encryptCard(card: CardInput, secretKey: string): { encData: string; encMode?: string } {
  // 순서·구분자는 문서 그대로여야 한다. 바꾸면 발급이 실패한다.
  const plain = `cardNo=${card.cardNo}&expYear=${card.expYear}&expMonth=${card.expMonth}&idNo=${card.idNo}&cardPw=${card.cardPw}`

  if (secretKey.length === 32) {
    // AES-256-CBC (권장) — key=시크릿키 전체, IV=앞 16자.
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(secretKey, "utf8"), Buffer.from(secretKey.slice(0, 16), "utf8"))
    return { encData: Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]).toString("hex"), encMode: "A2" }
  }

  // 폴백 — 시크릿키 길이가 32가 아니면 AES-128-ECB(문서 기본값).
  const cipher = crypto.createCipheriv("aes-128-ecb", Buffer.from(secretKey.slice(0, 16), "utf8"), null)
  return { encData: Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]).toString("hex") }
}

export function createNicepayProvider(): BillingProvider {
  const clientKey = process.env.NICEPAY_CLIENT_KEY ?? ""
  const secretKey = process.env.NICEPAY_SECRET_KEY ?? ""

  if (!clientKey || !secretKey) {
    // 자격증명이 없으면 만들지 않는다 — 호출부가 isBillingConfigured()로 먼저 걸러야 한다.
    throw new BillingUnsupportedError("결제")
  }

  const authHeader = `Basic ${Buffer.from(`${clientKey}:${secretKey}`, "utf8").toString("base64")}`

  /** 공통 호출 — 네트워크 실패도 raw를 남긴다(증거 유실 방지). */
  async function call(
    path: string,
    body: Record<string, unknown>,
    method: "POST" | "GET" = "POST",
  ): Promise<{ raw: Record<string, unknown>; networkError?: string }> {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(body),
      })
      return { raw: parsePgResponse(await res.text()) }
    } catch (e) {
      return { raw: {}, networkError: e instanceof Error ? e.message : "요청 실패" }
    }
  }

  const isOk = (raw: Record<string, unknown>) => String(raw.resultCode ?? "") === "0000"
  const msgOf = (raw: Record<string, unknown>, fallback: string) => String(raw.resultMsg ?? fallback)

  return {
    name: "nicepay",
    capabilities: { recurring: true },

    async issueBillingKey({ orderId, card, buyerName, buyerEmail }): Promise<BillingKeyResult> {
      const { encData, encMode } = encryptCard(card, secretKey)
      // ⚠️ 이 시점 이후로 card를 참조하지 않는다. 아래 어떤 값에도 카드 원문이 섞이면 안 된다.
      const { raw, networkError } = await call("/v1/subscribe/regist", {
        encData,
        orderId,
        ...(encMode ? { encMode } : {}),
        ...(buyerName ? { buyerName: buyerName.slice(0, 30) } : {}),
        ...(buyerEmail ? { buyerEmail: buyerEmail.slice(0, 60) } : {}),
      })
      if (networkError) return { ok: false, code: "NETWORK", message: networkError, raw }
      if (!isOk(raw) || !raw.bid) {
        return { ok: false, code: String(raw.resultCode ?? "UNKNOWN"), message: msgOf(raw, "빌링키 발급 실패"), raw }
      }
      return {
        ok: true,
        bid: String(raw.bid),
        tid: String(raw.tid ?? ""),
        cardName: raw.cardName ? String(raw.cardName) : null,
        cardCode: raw.cardCode ? String(raw.cardCode) : null,
        raw,
      }
    },

    async charge({ bid, orderId, amountKrw, goodsName }): Promise<ChargeResult> {
      const { raw, networkError } = await call(`/v1/subscribe/${encodeURIComponent(bid)}/payments`, {
        orderId,
        amount: amountKrw,
        // 40자 제한. 넘치면 PG가 거부하므로 자른다.
        goodsName: goodsName.slice(0, 40),
        cardQuota: "0", // 일시불
        useShopInterest: false, // 문서상 false만 지원
      })
      if (networkError) return { ok: false, code: "NETWORK", message: networkError, raw }
      // status가 'paid'가 아니면 승인이 아니다(ready/failed/cancelled).
      if (!isOk(raw) || String(raw.status ?? "") !== "paid") {
        return { ok: false, code: String(raw.resultCode ?? "UNKNOWN"), message: msgOf(raw, "결제 승인 실패"), raw }
      }
      return {
        ok: true,
        tid: String(raw.tid ?? ""),
        // ★PG가 말한 금액을 그대로 올린다. 우리 ready 행과의 대조는 billing_apply_payment가 한다.
        amountKrw: Number(raw.amount ?? 0),
        method: raw.payMethod ? String(raw.payMethod) : "card",
        approvedAt: raw.paidAt ? String(raw.paidAt) : new Date().toISOString(),
        receiptUrl: raw.receiptUrl ? String(raw.receiptUrl) : null,
        raw,
      }
    },

    async expireBillingKey({ bid, orderId }): Promise<boolean> {
      const { raw, networkError } = await call(`/v1/subscribe/${encodeURIComponent(bid)}/expire`, { orderId })
      if (networkError) return false
      return isOk(raw)
    },

    async cancel({ tid, orderId, reason }): Promise<boolean> {
      const { raw, networkError } = await call(`/v1/payments/${encodeURIComponent(tid)}/cancel`, {
        orderId,
        reason: reason.slice(0, 100),
      })
      if (networkError) return false
      return isOk(raw)
    },

    async inquire({ tid }): Promise<InquiryResult> {
      const { raw, networkError } = await call(`/v1/payments/${encodeURIComponent(tid)}`, {}, "GET")
      if (networkError) return { ok: false, code: "NETWORK", message: networkError, raw }
      if (!isOk(raw)) {
        // 조회 자체가 실패했다 = 승인 여부를 **모른다**. 이 경우 정산도 실패처리도 하지 않고
        // 다음 노티/크론에서 다시 시도해야 한다(모르는 상태를 '실패'로 굳히면 돈만 빠진다).
        return { ok: false, code: String(raw.resultCode ?? "UNKNOWN"), message: msgOf(raw, "조회 실패"), raw }
      }
      return readInquiry(raw)
    },

    async inquireByOrderId({ orderId, orderDateYmd }): Promise<InquiryResult> {
      // orderDate는 규격상 필수다(YYYYMMDD). 빠뜨리면 조회가 통째로 실패해
      // "승인 여부를 모르는" 상태가 영원히 안 풀린다.
      const qs = `?orderDate=${encodeURIComponent(orderDateYmd)}`
      const { raw, networkError } = await call(`/v1/payments/find/${encodeURIComponent(orderId)}${qs}`, {}, "GET")
      if (networkError) return { ok: false, code: "NETWORK", message: networkError, raw }
      if (!isOk(raw)) {
        // PG가 답은 했지만 성공이 아니다. **"거래 없음"과 "일시 장애"를 코드만으로 구분할 수
        // 없으므로** 호출부가 판단한다(renew.ts) — 여기서는 있는 그대로 돌려준다.
        return { ok: false, code: String(raw.resultCode ?? "UNKNOWN"), message: msgOf(raw, "조회 실패"), raw }
      }
      return readInquiry(raw)
    },
  }
}

/** 조회 응답(tid·주문번호 공통) → InquiryResult. 승인 판정은 status 하나로만 한다. */
function readInquiry(raw: Record<string, unknown>): InquiryResult {
  const status = String(raw.status ?? "")
  const amount = Number(raw.amount ?? 0)
  // 취소 누적 금액. 문서 표기는 영국식 cancelledAmount이지만(status도 cancelled/partialCancelled),
  // 미국식 철자로 오는 경우까지 받아 둔다 — 못 읽으면 전액 취소로 오판해 부분환불이 전액으로 처리된다.
  const canceled = Number(raw.cancelledAmount ?? raw.canceledAmount ?? 0)
  return {
    ok: true,
    approved: status === "paid",
    canceled: status === "cancelled" || status === "partialCancelled",
    tid: raw.tid ? String(raw.tid) : null,
    amountKrw: Number.isFinite(amount) && amount > 0 ? amount : null,
    canceledAmountKrw: Number.isFinite(canceled) && canceled > 0 ? canceled : null,
    // paidAt은 미완료 시 "0"이 온다(규격) — 그 경우 승인 시각이 없는 것으로 본다.
    approvedAt: raw.paidAt && String(raw.paidAt) !== "0" ? String(raw.paidAt) : null,
    raw,
  }
}
