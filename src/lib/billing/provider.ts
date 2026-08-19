// 결제대행사(PG) 추상화 — 나이스페이 의존을 한 파일(nicepay.ts)에 가두기 위한 경계.
//
// 왜 인터페이스를 두는가:
//   ① 나이스페이 API는 **세대가 둘**이다. 지금 문서로 확인된 것은 `MID + MerchantKey + SignData`를
//      쓰는 인증결제(PG Web) 규격이고, `clientKey/secretKey` + Basic 인증을 쓰는 REST 계열도 존재한다.
//      **우리 상점이 어느 쪽인지는 자격증명을 받아야 확정된다.** 아니면 통째로 다시 짜야 하므로
//      규격 의존 코드를 nicepay.ts 한 곳에만 둔다.
//   ② 자동 갱신(빌링키)은 별도 신청 승인 전이라 못 쓴다. 호출부마다 `if (빌링되나?)`가 번식하지
//      않도록 **capabilities.recurring**으로 표현하고, 미지원 메서드는 예외를 던진다.
//      분기는 renew.ts 한 곳에만 존재한다.

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
  /** 자동 갱신(빌링키) 사용 가능 여부. 나이스페이 별도 신청 승인 + env 스위치가 둘 다 켜져야 true. */
  recurring: boolean
}

/** 미지원 기능을 부를 때. 옵셔널 메서드(`method?.()`)로 두면 호출부마다 분기가 번식한다. */
export class BillingUnsupportedError extends Error {
  constructor(feature: string) {
    super(`${feature}은(는) 아직 사용할 수 없어요.`)
    this.name = "BillingUnsupportedError"
  }
}

/** PG가 응답한 승인 결과. 금액은 **PG가 말한 값** 그대로 담는다(우리 ready 행과 대조할 대상이므로). */
export type ApproveResult =
  | {
      ok: true
      tid: string
      /** PG가 승인했다고 응답한 금액. billing_apply_payment가 ready 행과 대조해 다르면 예외를 던진다. */
      amountKrw: number
      method: string | null
      approvedAt: string
      raw: Record<string, unknown>
    }
  | { ok: false; code: string; message: string; raw: Record<string, unknown> }

/**
 * 조회 API 결과 — **승인 여부의 최종 판정자**.
 *
 * 리턴 URL·결제통보(노티)는 둘 다 브라우저/외부가 보내는 값이라 그대로 믿을 수 없다.
 * "이 거래가 실제로 승인됐는가"는 우리 MID+상점키로 서명해 조회 API에 물어본 답만 신뢰한다.
 *
 * ⚠️ 나이스페이 조회 API는 **TID로만** 조회된다(주문번호 Moid로는 못 찾는다). 그래서
 *    TID를 모르는 'ready' 고아 행은 조회로 대사할 수 없고, TID를 물어다 주는 노티가
 *    유일한 복구 경로다(2026-08-19 규격 확인: manual-status.php).
 */
export type InquiryResult =
  | {
      ok: true
      /** 승인 상태인가. 이 값이 true일 때만 정산 RPC를 부른다. */
      approved: boolean
      /** 취소된 거래인가(전취소·후취소). */
      canceled: boolean
      raw: Record<string, unknown>
    }
  | { ok: false; code: string; message: string; raw: Record<string, unknown> }

/** 결제창에 넘길 파라미터(서명 포함). 값 생성은 반드시 서버에서 한다. */
export type CheckoutParams = {
  mid: string
  moid: string
  amt: number
  goodsName: string
  ediDate: string
  signData: string
  returnUrl: string
}

export interface BillingProvider {
  readonly name: string
  readonly capabilities: BillingCapabilities
  /** 결제창 호출용 파라미터 + 서명 생성. */
  buildCheckout(input: { orderId: string; amountKrw: number; goodsName: string; returnUrl: string }): CheckoutParams
  /** 인증 결과를 받아 **실제 승인**을 요청한다. 이 응답이 유일한 신뢰 소스다. */
  approve(input: { nextAppUrl: string; authToken: string; tid: string; amountKrw: number }): Promise<ApproveResult>
  /**
   * 거래 조회 — 승인 여부의 최종 판정자.
   * 결제통보(노티)를 받았을 때 **본문을 믿지 않고** 이걸로 다시 확인한 뒤에만 정산한다.
   */
  inquire(input: { tid: string }): Promise<InquiryResult>
  /**
   * 망취소 — 승인은 됐는데 우리 쪽 정산이 실패했을 때 되돌린다.
   * 금액 위변조로 billing_apply_payment가 예외를 던진 경우가 대표적이다. 이걸 안 하면 돈만 빠진다.
   */
  netCancel(input: { netCancelUrl: string; authToken: string; tid: string; amountKrw: number }): Promise<boolean>
}
