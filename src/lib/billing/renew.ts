// 매달 자동청구 — 갱신일이 지난 구독을 **저장된 빌키로** 청구한다.
//
// 이게 없으면 무슨 일이 나는가: 구독은 기간이 끝나면 billing_lapse_due()가 past_due로 내리고
// 유예 3일 뒤 expired + plan='free'로 강등한다. 즉 **한 번 결제한 고객이 한 달 뒤 자동으로
// 무료로 떨어진다.** 결제 부품(빌키·charge·정산 RPC)은 다 있었고, 연결만 없던 상태였다.
//
// ─────────────────────────────────────────────────────────────
// 🔴 이 파일의 존재 이유는 "두 번 긁지 않는 것" 하나다.
// ─────────────────────────────────────────────────────────────
// 가장 위험한 실패는 **카드는 승인됐는데 우리가 응답을 못 받은 경우**다(타임아웃·502).
// 이때 실패로 굳히고 다음 크론에서 다시 청구하면 같은 달에 두 번 결제된다 — 환불 분쟁 직행이다.
// 방어는 4겹이고, 어느 하나라도 빼면 뚫린다.
//
//   ① **주문번호를 (워크스페이스 × 한국날짜)로 고정** — `RNW-42F70FA1-20260921`.
//      billing_payments.order_id가 unique라 같은 날 두 번째 시도는 **DB가 거부**한다.
//      Vercel 크론은 중복 실행이 가능하다고 문서에 명시돼 있고, 결제 화면의 지연 대사도
//      같은 시각에 돌 수 있다 → 이 unique가 사실상의 뮤텍스다.
//   ② **결과를 모르면 절대 다시 청구하지 않는다** — 응답을 못 받은 시도는 refund_reason에
//      `unknown:` 표식을 남겨 '미결'로 두고, 미결이 있는 워크스페이스는 청구 대상에서 뺀다.
//      (표식을 쓰는 이유: 6시간 뒤 billing_fail_stale_checkouts가 그 행을 'failed'로 바꿔버려
//       상태만으로는 "확정된 실패"와 "모르는 실패"를 구분할 수 없기 때문이다. 그 함수는
//       refund_reason을 coalesce로 보존하므로 표식은 살아남는다.)
//   ③ **미결은 PG 주문번호 조회로 확정한다** — 매 실행마다 `/v1/payments/find/{orderId}`로
//      "이 주문 승인됐나"를 직접 묻는다. 승인이면 정산(billing_apply_payment가 'failed'→'paid'
//      복구를 허용한다·마이그141), 아니면 실패로 확정해 표식을 지운다.
//   ④ **기간이 안 지났으면 대상이 아니다** — 정산이 성공하면 current_period_end가 한 달 밀린다.
//      즉 성공한 순간 구조적으로 재청구 대상에서 빠진다. next_charge_at 같은 보조 컬럼이
//      낡아 있어도 이중 청구로 이어지지 않게, 청구 판정은 **current_period_end만** 본다.
//
// 실패 방향은 안전하다: 청구가 안 되면 past_due(플랜 유지) → 유예 3일 → free 강등이다.
// 반대로 "모르겠으면 일단 긁는다"는 방향은 절대 만들지 않았다.
//
// 금액: **구독 행에 적힌 amount_krw**(고객이 동의한 금액)를 청구한다. 가격표(plans.ts)를
// 다시 읽지 않는 이유 — 가격이 바뀌면 법적 의무②(금액 변경 7일 전 고지 + 재동의)가 먼저다.
// 고지 없이 새 가격을 긁는 것이 이 코드에서 나올 수 있는 최악의 사고다.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { createNicepayProvider } from "@/lib/billing/nicepay"
import { toJson, type BillingProvider } from "@/lib/billing/provider"
import {
  RENEW_ORDER_PREFIX,
  goodsNameFor,
  isPayablePlan,
  kstYmd,
  orderDateOfRenewOrderId,
  periodFor,
  quoteAmountKrw,
  renewOrderId,
  type BillingCycle,
} from "@/lib/billing/orders"

type Admin = SupabaseClient<Database>

/**
 * 🔴 **확정 표식.** refund_reason이 이 접두사로 시작하는 갱신 행만 "결과를 아는 것"으로 본다.
 *
 * 상태(status)로 판단하지 않는 이유: 6시간 뒤 billing_fail_stale_checkouts가 미결 행을
 * 'failed'로 바꿔버려, 상태만 보면 **"확정된 실패"와 "모르는 실패"가 구분되지 않는다.**
 * 구분에 실패하면 승인된 거래를 실패로 알고 다음날 다시 긁는다 = 이중 결제.
 * 그래서 "확정했다"는 사실을 사유 문자열에 명시적으로 남기고, 그 외는 전부 미결로 취급한다.
 */
const RESOLVED_PREFIX = "renew:"

/** 미결 사유 접두사(사람이 DB를 볼 때용). 확정 표식이 아니므로 다음 실행에서 다시 조회된다. */
const PENDING_PREFIX = "pending:"

/** 미결을 되짚어 볼 기간(일). 이보다 오래된 건 구독이 이미 만료돼 재청구 판단과 무관하다. */
const LOOKBACK_DAYS = 45

/**
 * 🔴 "그런 거래는 없다"를 뜻하는 나이스페이 응답코드. **이 목록에 있을 때만** 실패로 확정한다.
 *
 * 나머지 실패 코드(DB오류 2000 · API 지연 A299/U303 · 대외계 오류 U501 등)는 **"모르겠다"** 이지
 * "결제 안 됐다"가 아니다. 그걸 실패로 굳히면 이미 승인된 카드를 다음날 또 긁는다.
 * 목록 출처: nicepay-manual/common/code.md (2026-08-21 확인)
 */
const NOT_FOUND_CODES = new Set([
  "A118", // 조회 결과데이터 없음
  "A243", // 주문정보가 존재하지 않습니다
  "A251", // 거래내역이 존재하지 않습니다
  "U107", // 거래내역이 존재 하지 않습니다
  "U126", // orderId가 존재 하지 않습니다
])

/**
 * 미결을 실패로 확정하기까지의 최소 대기(분). 결제통보(노티) 재전송이 최대 10회·최대 10분
 * 간격이라 최악 100분까지 늦게 도착한다 — 그보다 넉넉히 잡는다.
 * (billing_fail_stale_checkouts의 기본값 360분과 같은 근거·같은 값)
 */
const RESOLVE_AFTER_MINUTES = 360

export type RenewSummary = {
  /** 승인 여부를 모르던 시도를 이번에 확정한 수(정산 또는 실패 확정). */
  resolved: number
  /** 이번에 청구가 성공해 기간이 연장된 구독 수. */
  charged: number
  /** 청구가 확정적으로 실패한 수(한도초과·카드정지 등). past_due로 흘러간다. */
  failed: number
  /** 아직 승인 여부를 모르는 시도 수. 이 워크스페이스는 청구를 건너뛴다. */
  pending: number
  /** next_charge_at을 기간 만료일에 맞춰 고친 수(고지 문구용 보조 컬럼). */
  healed: number
  errors: string[]
}

const emptySummary = (): RenewSummary => ({
  resolved: 0,
  charged: 0,
  failed: 0,
  pending: 0,
  healed: 0,
  errors: [],
})

/**
 * 갱신 스윕. 크론(`/api/billing/reconcile`)이 하루 한 번 부른다.
 *
 * ⚠️ 호출 순서가 중요하다 — **stale 정리·lapse보다 먼저** 돌아야 한다.
 *    미결 행(ready)을 stale 정리가 먼저 닫으면 표식만 남고, 기간 만료 처리가 먼저 돌면
 *    청구 성공한 구독까지 past_due를 한 번 찍고 지나간다.
 */
export async function runRenewals(admin: Admin, recurringEnabled: boolean): Promise<RenewSummary> {
  const out = emptySummary()
  if (!recurringEnabled) return out // 자격증명 없음 = PG를 부를 수 없다. 조용히 아무것도 안 한다.

  let provider: BillingProvider
  try {
    provider = createNicepayProvider()
  } catch (e) {
    out.errors.push(`provider:${e instanceof Error ? e.message : "생성 실패"}`)
    return out
  }

  // ── 1단계: 결과를 모르는 지난 시도부터 확정한다(청구보다 먼저!) ──
  const blocked = await resolvePendingRenewals(admin, provider, out)

  // ── 2단계: 갱신일이 지난 구독을 청구한다 ──
  await chargeDueSubscriptions(admin, provider, blocked, out)

  return out
}

/**
 * 승인 여부를 모르는 갱신 시도를 PG 주문번호 조회로 확정한다.
 * 반환: 아직도 결과를 모르는 워크스페이스 id 집합 → **이번 실행에서 청구하면 안 되는 곳**이다.
 */
async function resolvePendingRenewals(
  admin: Admin,
  provider: BillingProvider,
  out: RenewSummary,
): Promise<Set<string>> {
  const blocked = new Set<string>()
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString()

  // 정산되지 않은 갱신 시도를 전부 긁는다(접두사로 갱신 건만 — 첫 결제 'CPL-'는 웹훅이 담당).
  // 'paid'는 애초에 제외되고, 남은 것 중 **확정 표식이 없는 것이 미결**이다.
  const { data: rows, error } = await admin
    .from("billing_payments")
    .select("id, order_id, workspace_id, status, amount_krw, refund_reason, created_at")
    .like("order_id", `${RENEW_ORDER_PREFIX}-%`)
    .in("status", ["ready", "failed"])
    .gte("created_at", since)
    .order("created_at", { ascending: true })

  if (error) {
    out.errors.push(`pending_query:${error.message}`)
    // 🔴 미결을 못 읽었다 = 재청구해도 되는지 모른다. 이번 실행의 청구를 통째로 막는다.
    //    (빈 Set을 돌려주면 "미결 없음"으로 오해해 청구가 진행된다.)
    blocked.add("*")
    return blocked
  }

  // 확정 표식이 붙은 행은 결과를 아는 것 → 건드리지 않는다.
  const unresolved = (rows ?? []).filter((r) => !(r.refund_reason ?? "").startsWith(RESOLVED_PREFIX))

  for (const row of unresolved) {
    const orderDate = orderDateOfRenewOrderId(row.order_id)
    if (!orderDate) {
      // 우리가 만든 형식이 아니다 = 조회할 수 없다. 표식만 남기고 넘어간다(사람이 봐야 한다).
      out.errors.push(`pending_bad_order_id:${row.order_id}`)
      blocked.add(row.workspace_id)
      out.pending += 1
      continue
    }

    const inq = await provider.inquireByOrderId({ orderId: row.order_id, orderDateYmd: orderDate })
    const ageMin = (Date.now() - new Date(row.created_at).getTime()) / 60000

    // PG가 답을 못 줬다(네트워크). 승인 여부를 **모른다** → 절대 실패로 굳히지 않는다.
    if (!inq.ok && inq.code === "NETWORK") {
      await markPending(admin, row.id, row.refund_reason, "unreachable")
      blocked.add(row.workspace_id)
      out.pending += 1
      continue
    }

    // PG가 "성공 아님"이라고 답했다. 여기서 **"거래 없음"만** 실패로 확정한다.
    //   · 코드가 거래없음 목록에 있고
    //   · 충분히 기다렸을 때(승인 처리 중인 거래를 없다고 오판하지 않기 위한 이중 안전장치)
    // 그 외 코드(DB오류·API 지연 등)는 "모르겠다"이므로 영원히 미결로 둔다 — 재청구는 안 된다.
    // (미결이 계속되면 구독은 유예 후 만료된다. 고객이 다시 결제하면 되는 상태이고,
    //  이중 결제보다 회복이 쉬운 방향이다. 에러 로그로 사람이 볼 수 있게 남긴다.)
    if (!inq.ok) {
      if (NOT_FOUND_CODES.has(inq.code) && ageMin >= RESOLVE_AFTER_MINUTES) {
        await settleAsFailed(admin, row.id, row.order_id, row.status, `renew:no_transaction:${inq.code}`)
        out.resolved += 1
        continue
      }
      if (!NOT_FOUND_CODES.has(inq.code)) {
        out.errors.push(`pending_unresolved:${row.order_id}:${inq.code}:${inq.message}`)
      }
      await markPending(admin, row.id, row.refund_reason, `pg:${inq.code}`)
      blocked.add(row.workspace_id)
      out.pending += 1
      continue
    }

    // 승인된 거래였다 → 지금이라도 정산한다(마이그141이 'failed' → 'paid' 복구를 허용한다).
    if (inq.approved && !inq.canceled) {
      const applied = await applyPayment(admin, {
        orderId: row.order_id,
        tid: inq.tid ?? "",
        amountKrw: inq.amountKrw ?? row.amount_krw,
        approvedAt: inq.approvedAt,
        raw: toJson({ source: "renew_resolve", inquiry: inq.raw }),
      })
      if (applied.ok) {
        await syncNextCharge(admin, row.workspace_id)
        out.resolved += 1
        out.charged += 1
      } else {
        // 금액 불일치 등 — 재시도해도 결과가 같다. 사람이 봐야 하므로 미결로 남긴다.
        out.errors.push(`resolve_apply:${row.order_id}:${applied.message}`)
        blocked.add(row.workspace_id)
        out.pending += 1
      }
      continue
    }

    // 승인이 아니었다(미승인·취소). PG가 거래를 찾아 상태까지 답했으므로 확실하다 → 실패로 확정.
    await settleAsFailed(admin, row.id, row.order_id, row.status, inq.canceled ? "renew:canceled" : "renew:not_approved")
    out.resolved += 1
  }

  return blocked
}

/** 갱신일이 지난 구독을 청구한다. `blocked`에 든 워크스페이스는 건너뛴다(미결 있음). */
async function chargeDueSubscriptions(
  admin: Admin,
  provider: BillingProvider,
  blocked: Set<string>,
  out: RenewSummary,
): Promise<void> {
  // auto_renew가 켜진 구독 전부를 한 번에 읽는다(보통 한 자릿수). 청구 대상 판정과
  // next_charge_at 보정을 같은 목록에서 한다.
  const { data: subs, error } = await admin
    .from("billing_subscriptions")
    .select("workspace_id, plan, status, billing_cycle, amount_krw, current_period_end, next_charge_at")
    .eq("auto_renew", true)
    .in("status", ["active", "past_due"])
    .is("cancel_effective_at", null)

  if (error) {
    out.errors.push(`subs_query:${error.message}`)
    return
  }
  if (!subs?.length) return

  // 미결 조회 자체가 실패했다 = 재청구해도 되는지 모른다 → 이번 실행은 청구하지 않는다.
  const chargingBlocked = blocked.has("*")
  const now = Date.now()

  for (const sub of subs) {
    const periodEnd = new Date(sub.current_period_end ?? "")
    if (Number.isNaN(periodEnd.getTime())) {
      out.errors.push(`bad_period_end:${sub.workspace_id}`)
      continue
    }

    // ④ 청구 판정은 기간 만료일 **하나만** 본다(위 헤더 주석 참조).
    if (periodEnd.getTime() > now) {
      // 아직 기간 중 — 고지 문구가 쓰는 next_charge_at만 맞춰 둔다.
      // ⚠️ 문자열 비교 금지: DB는 "…+00", JS는 "…Z"로 같은 시각을 다르게 적는다(매일 헛 UPDATE).
      const nextAt = sub.next_charge_at ? new Date(sub.next_charge_at).getTime() : null
      if (nextAt !== periodEnd.getTime()) {
        const { error: healErr } = await admin
          .from("billing_subscriptions")
          .update({ next_charge_at: sub.current_period_end, updated_at: new Date().toISOString() })
          .eq("workspace_id", sub.workspace_id)
        if (!healErr) out.healed += 1
      }
      continue
    }

    if (chargingBlocked || blocked.has(sub.workspace_id)) continue // 미결 있음 = 재청구 금지
    if (!isPayablePlan(sub.plan)) {
      out.errors.push(`unpayable_plan:${sub.workspace_id}:${sub.plan}`)
      continue
    }
    if (!sub.amount_krw || sub.amount_krw <= 0) {
      out.errors.push(`bad_amount:${sub.workspace_id}`)
      continue
    }

    // 저장된 빌키. 없으면(카드 삭제 등) 청구할 수단이 없다 → 기간 만료 경로로 흘려보낸다.
    const { data: key } = await admin
      .from("billing_keys")
      .select("bid")
      .eq("workspace_id", sub.workspace_id)
      .eq("status", "active")
      .maybeSingle()
    if (!key?.bid) {
      await logEvent(admin, sub.workspace_id, "renew_failed", { reason: "no_billing_key" })
      out.failed += 1
      continue
    }

    const cycle: BillingCycle = sub.billing_cycle === "yearly" ? "yearly" : "monthly"
    const amountKrw = sub.amount_krw // ★고객이 동의한 금액. 가격표를 다시 읽지 않는다.
    const listPrice = quoteAmountKrw(sub.plan, cycle)
    if (listPrice !== amountKrw) {
      // 가격표가 바뀌었다. 새 가격을 긁으려면 7일 전 고지 + 재동의가 먼저다(법적 의무②).
      console.warn(
        `[billing/renew] price drift ws=${sub.workspace_id} agreed=${amountKrw} list=${listPrice} — 동의 금액으로 청구함`,
      )
    }

    // ① 주문번호 = 워크스페이스 × 한국날짜. 같은 날 두 번째 시도는 여기서 DB가 거부한다.
    const ymd = kstYmd()
    const orderId = renewOrderId(sub.workspace_id, ymd)

    // 새 기간은 **직전 기간이 끝난 시점부터** 시작한다. now()로 잡으면 크론 시각(09:00 KST)과
    // 결제 시각의 차이만큼 결제일이 매달 뒤로 밀린다.
    const start = periodEnd
    const { end } = periodFor(cycle, start)

    const { error: startErr } = await admin.rpc("billing_start_checkout", {
      p_workspace_id: sub.workspace_id,
      p_plan: sub.plan,
      p_billing_cycle: cycle,
      p_seats: 0,
      p_amount_krw: amountKrw,
      p_order_id: orderId,
      p_period_start: start.toISOString(),
      p_period_end: end.toISOString(),
    })
    if (startErr) {
      // 주문번호 중복 = 오늘 이미 시도했다(정상적인 중복 방지 동작). 조용히 넘어간다.
      if (/duplicate key|unique/i.test(startErr.message)) continue
      out.errors.push(`start:${sub.workspace_id}:${startErr.message}`)
      continue
    }

    // 표기용 — 이 행은 결제창이 아니라 빌키로 긁은 건이다. 실패해도 로직에 영향 없다.
    await admin.from("billing_payments").update({ pay_source: "billing_key" }).eq("order_id", orderId)

    const charged = await provider.charge({
      bid: key.bid,
      orderId,
      amountKrw,
      goodsName: goodsNameFor(sub.plan, cycle),
    })

    if (!charged.ok) {
      // 🔴 응답을 못 받았다 = 승인 여부를 **모른다**. 실패로 굳히면 다음 실행에서 다시 긁혀
      //    이중 결제가 된다. 즉시 주문번호로 조회해 확정하고, 그래도 모르면 미결로 남긴다.
      if (charged.code === "NETWORK") {
        const inq = await provider.inquireByOrderId({ orderId, orderDateYmd: ymd })
        if (inq.ok && inq.approved && !inq.canceled) {
          const applied = await applyPayment(admin, {
            orderId,
            tid: inq.tid ?? "",
            amountKrw: inq.amountKrw ?? amountKrw,
            approvedAt: inq.approvedAt,
            raw: toJson({ source: "renew_network_recovered", inquiry: inq.raw }),
          })
          if (applied.ok) {
            await syncNextCharge(admin, sub.workspace_id)
            out.charged += 1
            continue
          }
        }
        if (inq.ok && !inq.approved) {
          await failPayment(admin, orderId, "renew:not_approved", toJson(charged.raw))
          await logEvent(admin, sub.workspace_id, "renew_failed", { order_id: orderId, code: "NETWORK", resolved: "not_approved" })
          out.failed += 1
          continue
        }
        // 여기까지 왔으면 정말 모른다 → 미결로 남기고 다음 실행에서 다시 물어본다.
        await markPendingByOrder(admin, orderId, "charge_no_response")
        await logEvent(admin, sub.workspace_id, "renew_failed", { order_id: orderId, code: "NETWORK", resolved: "pending" })
        out.pending += 1
        continue
      }

      // PG가 명확히 거절했다(한도초과·카드정지 등). 실패로 확정해도 안전하다.
      await failPayment(admin, orderId, `renew:${charged.code}`, toJson(charged.raw))
      await logEvent(admin, sub.workspace_id, "renew_failed", {
        order_id: orderId,
        code: charged.code,
        message: charged.message,
      })
      out.failed += 1
      continue
    }

    // ── 정산(원자 처리): 영수증·기간 연장·plan 유지·사용량 재설정·감사로그 ──
    const applied = await applyPayment(admin, {
      orderId,
      tid: charged.tid,
      amountKrw: charged.amountKrw, // ★PG가 말한 금액. ready 행과 다르면 RPC가 예외를 던진다.
      approvedAt: charged.approvedAt,
      raw: toJson(charged.raw),
    })

    if (!applied.ok) {
      // 승인은 됐는데 우리 정산이 실패했다 = 돈만 빠진 상태. 즉시 되돌린다(checkout과 같은 처리).
      const reverted = await provider.cancel({
        tid: charged.tid,
        orderId,
        reason: "정산 실패 자동 취소",
        amountKrw: charged.amountKrw,
      })
      await failPayment(
        admin,
        orderId,
        `renew_apply:${applied.message}${reverted ? "" : " (자동취소 실패 — 수동 확인 필요)"}`,
        toJson({ apply_error: applied.message, reverted }),
      )
      await logEvent(admin, sub.workspace_id, "renew_failed", {
        order_id: orderId,
        stage: "apply",
        error: applied.message,
        reverted,
      })
      out.failed += 1
      continue
    }

    await syncNextCharge(admin, sub.workspace_id)
    out.charged += 1
  }
}

// ─────────────────────────────────────────────────────────────
// 작은 도우미들
// ─────────────────────────────────────────────────────────────

/** 정산 RPC 호출. 성공/실패를 예외 없이 돌려준다(호출부가 되돌리기를 판단해야 하므로). */
async function applyPayment(
  admin: Admin,
  p: { orderId: string; tid: string; amountKrw: number; approvedAt: string | null; raw: ReturnType<typeof toJson> },
): Promise<{ ok: boolean; message: string }> {
  const { error } = await admin.rpc("billing_apply_payment", {
    p_order_id: p.orderId,
    p_tid: p.tid,
    p_amount_krw: p.amountKrw,
    p_approved_at: p.approvedAt ?? new Date().toISOString(),
    p_raw: p.raw,
  })
  return { ok: !error, message: error?.message ?? "" }
}

/** 확정된 실패로 닫는다(ready 행 전용 RPC). */
async function failPayment(
  admin: Admin,
  orderId: string,
  reason: string,
  raw: ReturnType<typeof toJson>,
): Promise<void> {
  const { error } = await admin.rpc("billing_fail_payment", { p_order_id: orderId, p_reason: reason, p_raw: raw })
  if (error) console.error("[billing/renew] fail_payment:", orderId, error.message)
}

/**
 * 미결 사유를 남긴다. **상태는 건드리지 않는다** — 사람이 DB를 볼 때의 설명이 목적이다.
 * 확정 표식(`renew:`)이 아니므로 다음 실행에서 다시 조회된다.
 * 이미 미결 사유가 있으면 덮어쓰지 않는다(최초 사유가 더 유용하다).
 */
async function markPending(
  admin: Admin,
  paymentId: string,
  current: string | null,
  reason: string,
): Promise<void> {
  if (current?.startsWith(PENDING_PREFIX)) return
  const { error } = await admin
    .from("billing_payments")
    .update({ refund_reason: `${PENDING_PREFIX}${reason}` })
    .eq("id", paymentId)
    .neq("status", "paid")
  if (error) console.error("[billing/renew] mark_pending:", paymentId, error.message)
}

/** 주문번호로 미결 사유를 남긴다(방금 만든 ready 행용). */
async function markPendingByOrder(admin: Admin, orderId: string, reason: string): Promise<void> {
  const { error } = await admin
    .from("billing_payments")
    .update({ refund_reason: `${PENDING_PREFIX}${reason}` })
    .eq("order_id", orderId)
    .neq("status", "paid")
  if (error) console.error("[billing/renew] mark_pending_order:", orderId, error.message)
}

/**
 * 미결을 "확정된 실패"로 닫는다. 사유에 **확정 표식(`renew:`)을 반드시 붙인다** —
 * 이 표식이 있어야 다음 실행이 이 행을 "결과를 아는 것"으로 보고 재청구를 허용한다.
 *
 * 아직 ready면 RPC로, stale 정리가 이미 failed로 바꿨으면 사유만 직접 갱신한다
 * (billing_fail_payment는 ready가 아니면 'noop'이라 사유가 안 바뀐다).
 */
async function settleAsFailed(
  admin: Admin,
  paymentId: string,
  orderId: string,
  status: string,
  reason: string,
): Promise<void> {
  const tagged = reason.startsWith(RESOLVED_PREFIX) ? reason : `${RESOLVED_PREFIX}${reason}`
  if (status === "ready") {
    await failPayment(admin, orderId, tagged, toJson({}))
    return
  }
  const { error } = await admin
    .from("billing_payments")
    .update({ status: "failed", refund_reason: tagged })
    .eq("id", paymentId)
    .neq("status", "paid")
  if (error) console.error("[billing/renew] settle_failed:", orderId, error.message)
}

/**
 * 다음 청구 예정일을 기간 만료일에 맞춘다. 청구 판정에는 쓰지 않고(그건 current_period_end),
 * **7일 전 고지(billing_notice_upcoming)의 날짜·문구**에만 쓰인다.
 */
async function syncNextCharge(admin: Admin, workspaceId: string): Promise<void> {
  const { data } = await admin
    .from("billing_subscriptions")
    .select("current_period_end")
    .eq("workspace_id", workspaceId)
    .maybeSingle()
  if (!data?.current_period_end) return
  await admin
    .from("billing_subscriptions")
    .update({ next_charge_at: data.current_period_end, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
}

/** 감사 로그. kind는 마이그141의 화이트리스트에 있는 값만 쓸 수 있다. */
async function logEvent(
  admin: Admin,
  workspaceId: string,
  kind: "renew_failed",
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from("billing_events")
    .insert({ workspace_id: workspaceId, kind, payload: toJson(payload) })
  if (error) console.error("[billing/renew] log_event:", workspaceId, error.message)
}
