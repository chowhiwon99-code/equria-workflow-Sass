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
   * 망취소 — 승인은 됐는데 우리 쪽 정산이 실패했을 때 되돌린다.
   * 금액 위변조로 billing_apply_payment가 예외를 던진 경우가 대표적이다. 이걸 안 하면 돈만 빠진다.
   */
  netCancel(input: { netCancelUrl: string; authToken: string; tid: string; amountKrw: number }): Promise<boolean>
}
