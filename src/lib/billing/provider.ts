// 결제대행사(PG) 추상화 — 나이스페이 의존을 한 파일(nicepay.ts)에 가두기 위한 경계.
//
// 2026-08-20 규격 전환: 나이스페이 담당자 회신 + 공식 매뉴얼로 **두 가지가 확정**됐다.
//   ① 자격증명은 `MID + 상점키`가 아니라 **`클라이언트키 + 시크릿키`**이고 인증은 `Authorization: Basic`이다.
//      ("포스타트에서는 홈페이지 연동 시 MID가 아닌 클라이언트키/시크릿키 통하여 연동이 가능합니다.")
//   ② 정기결제는 **결제창을 쓰지 않는다.** 빌키 발급/승인/삭제만 PG가 제공하고
//      "상품 구축, 자동결제 기능, **카드정보입력창**"은 가맹점이 직접 만든다.
//   → 그래서 인터페이스가 `buildCheckout/approve/netCancel`(결제창 3종)에서
//     `issueBillingKey/charge/expireBillingKey/cancel`(빌키 4종)로 바뀌었다.
//     경계를 둔 덕분에 라우트·DB·RPC는 그대로 두고 이 파일과 nicepay.ts만 갈았다.
//
// 매뉴얼: https://github.com/nicepayments/nicepay-manual

import type { Json } from "@/lib/supabase/types"

/**
 * PG 원본 응답을 jsonb 컬럼에 넣기 전 통과시키는 관문.
 * 타입을 맞추는 목적만이 아니라, **직렬화 불가능한 값(순환참조·undefined·함수)이 섞여
 * INSERT가 통째로 실패하는 것**을 여기서 걸러낸다. raw는 분쟁 시 유일한 증거라 유실되면 안 된다.
 */
export function toJson(v: unknown): Json {
  try {
    return JSON.parse(JSON.stringify(v ?? {})) as Json
  } catch {
    return { _unserializable: String(v) } as Json
  }
}

export type BillingCapabilities = {
  /** 자동 갱신(빌링키) 사용 가능 여부. 자격증명이 주입돼야 true. */
  recurring: boolean
}

/** 미지원 기능을 부를 때. 옵셔널 메서드(`method?.()`)로 두면 호출부마다 분기가 번식한다. */
export class BillingUnsupportedError extends Error {
  constructor(feature: string) {
    super(`${feature}은(는) 아직 사용할 수 없어요.`)
    this.name = "BillingUnsupportedError"
  }
}

/**
 * 카드 원문 — 빌키를 발급받는 **그 한 번**만 존재해야 하는 값.
 *
 * 🔴 절대 규칙 (어기면 카드정보 유출 사고다)
 *   · DB에 저장하지 않는다. 저장하는 건 발급받은 `bid`와 마지막 4자리뿐이다.
 *   · 로그·에러 메시지·PG raw 응답 저장에 절대 섞지 않는다.
 *   · 이 타입의 값은 nicepay.ts의 암호화 직전까지만 살아 있고 그 뒤 참조하지 않는다.
 *   · 브라우저에서 암호화할 수 없다(시크릿키가 노출된다) → 서버를 반드시 경유한다.
 */
export type CardInput = {
  /** 카드번호(숫자만, 15~16자리) */
  cardNo: string
  /** 유효기간 연도 2자리 "YY" */
  expYear: string
  /** 유효기간 월 2자리 "MM" */
  expMonth: string
  /** 생년월일 6자리(YYMMDD) 또는 사업자번호 10자리 */
  idNo: string
  /** 카드 비밀번호 **앞 2자리** */
  cardPw: string
}

/** 빌키 발급 결과. 성공해도 카드 원문은 어디에도 남지 않는다(bid + 표시용 정보만). */
export type BillingKeyResult =
  | {
      ok: true
      /** NICEPAY가 발급한 빌링키. 이걸로 매달 청구한다. */
      bid: string
      /** 발급 거래의 TID(증빙용). */
      tid: string
      cardName: string | null
      cardCode: string | null
      raw: Record<string, unknown>
    }
  | { ok: false; code: string; message: string; raw: Record<string, unknown> }

/** 빌키 승인(청구) 결과. 금액은 **PG가 말한 값** 그대로 담는다(우리 ready 행과 대조할 대상이므로). */
export type ChargeResult =
  | {
      ok: true
      tid: string
      /** PG가 승인했다고 응답한 금액. billing_apply_payment가 ready 행과 대조해 다르면 예외를 던진다. */
      amountKrw: number
      method: string | null
      approvedAt: string
      receiptUrl: string | null
      raw: Record<string, unknown>
    }
  | { ok: false; code: string; message: string; raw: Record<string, unknown> }

/**
 * 조회 API 결과 — **승인 여부의 최종 판정자**.
 *
 * 결제통보(노티)는 외부가 보내는 값이라 그대로 믿을 수 없다.
 * "이 거래가 실제로 승인됐는가"는 우리 자격증명으로 조회 API에 물어본 답만 신뢰한다.
 */
export type InquiryResult =
  | {
      ok: true
      /** 승인 상태인가. 이 값이 true일 때만 정산 RPC를 부른다. */
      approved: boolean
      /** 취소된 거래인가(전취소·후취소). */
      canceled: boolean
      /** 승인 거래번호. 주문번호로 조회한 경우 **이걸로만 tid를 알 수 있다**(정산 RPC에 필요). */
      tid: string | null
      /**
       * 🔴 이 거래가 실제로 속한 주문번호(PG가 돌려준 값, 매뉴얼상 필수 필드).
       * `inquire({tid})`로 조회한 결과를 쓰는 호출부는 **반드시 이 값을 통보 본문의 moid와
       * 대조**해야 한다 — tid는 승인/취소 여부만 증명하고 "그 tid가 주장하는 주문의 것인가"는
       * 증명하지 않는다. 대조 없이 쓰면 공격자가 자기 자신의 무관한 tid로 남의 order_id를
       * 지정한 위조 통보를 보내 유료 고객을 강등시킬 수 있다(2026-08-25 리뷰 발견).
       */
      orderId: string | null
      /** PG가 말한 승인 금액. ready 행과의 대조는 billing_apply_payment가 한다. */
      amountKrw: number | null
      /** 취소된 금액(누적). 부분취소면 결제액보다 작다. 취소 반영(billing_apply_cancellation)에 쓴다. */
      canceledAmountKrw: number | null
      /** 승인 시각(ISO). 없으면 호출부가 now()로 대체한다. */
      approvedAt: string | null
      raw: Record<string, unknown>
    }
  | { ok: false; code: string; message: string; raw: Record<string, unknown> }

export interface BillingProvider {
  readonly name: string
  readonly capabilities: BillingCapabilities

  /**
   * 카드 원문으로 빌키를 발급받는다. **카드 원문이 존재하는 유일한 경로다.**
   * 성공하면 호출부는 bid만 저장하고 CardInput 참조를 즉시 버려야 한다.
   */
  issueBillingKey(input: {
    orderId: string
    card: CardInput
    buyerName?: string | null
    buyerEmail?: string | null
  }): Promise<BillingKeyResult>

  /** 저장된 빌키로 청구한다. 첫 결제와 매달 갱신이 **같은 경로**를 쓴다. */
  charge(input: { bid: string; orderId: string; amountKrw: number; goodsName: string }): Promise<ChargeResult>

  /** 빌키 폐기(해지·카드 교체 시). 실패해도 우리 쪽 상태는 revoked로 두는 게 안전하다. */
  expireBillingKey(input: { bid: string; orderId: string }): Promise<boolean>

  /**
   * 승인 취소 — 승인은 됐는데 우리 쪽 정산이 실패했을 때 되돌린다(옛 망취소의 역할).
   * 금액 위변조로 billing_apply_payment가 예외를 던진 경우가 대표적이다. 이걸 안 하면 돈만 빠진다.
   */
  cancel(input: { tid: string; orderId: string; reason: string; amountKrw?: number }): Promise<boolean>

  /**
   * 거래 조회 — 승인 여부의 최종 판정자.
   * 결제통보(노티)를 받았을 때 **본문을 믿지 않고** 이걸로 다시 확인한 뒤에만 정산한다.
   */
  inquire(input: { tid: string }): Promise<InquiryResult>

  /**
   * 🔴 주문번호로 거래 조회 — **중복 청구를 막는 유일한 수단.**
   *
   * 청구 요청이 타임아웃·네트워크 오류로 끊기면 우리는 승인 여부를 **모른다**(tid도 못 받았다).
   * 이때 실패로 굳히고 다음날 다시 긁으면 **같은 달에 두 번 결제된다.** 그래서 tid가 아니라
   * **우리가 만든 주문번호**로 PG에 직접 물어 확정한다. 이 경로가 없으면 자동청구를 켤 수 없다.
   *
   * `orderDateYmd`는 주문 생성일(KST, YYYYMMDD) — 규격상 필수 파라미터라 주문번호에 박아 둔다.
   * 규격: GET /v1/payments/find/{orderId}?orderDate=YYYYMMDD (nicepay-manual/api/status-transaction.md)
   */
  inquireByOrderId(input: { orderId: string; orderDateYmd: string }): Promise<InquiryResult>
}
