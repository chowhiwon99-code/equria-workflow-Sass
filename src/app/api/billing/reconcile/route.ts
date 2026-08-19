// 결제 자동 점검(대사) — 크론이 하루 한 번 부르고, 결제 화면 진입 시에도 한 번 부른다.
//
// 이게 없으면 아무도 안 도는 일 4가지:
//   ① 결제창만 띄우고 닫은 'ready' 행이 영원히 쌓인다
//   ② 해지 예약일이 지나도 구독이 안 닫힌다 (billing_expire_due)
//   ③ 🔴 기간이 끝나도 구독이 active로 남는다 = **한 번 결제로 평생 이용** (billing_lapse_due)
//   ④ 🔴 결제 7일 전 고지가 안 나간다 = **법적 의무② 위반** (billing_notice_upcoming)
//
// 🔴 스케줄을 "하루 1회"로 잡은 이유 (vercel.json과 세트로 읽을 것)
//   Vercel **Hobby 플랜은 크론이 하루 1회로 제한**되고, 그보다 잦은 cron 식은
//   **배포 자체가 실패**한다("Hobby accounts are limited to daily cron jobs", 2026-08-19 문서 확인).
//   현재 팀 플랜을 API로 확인할 수 없어, 어느 플랜에서도 배포가 깨지지 않는 하루 1회로 맞췄다.
//   → 실시간성이 필요한 복구는 크론이 아니라 **결제통보(웹훅)** 가 담당한다.
//   → Pro 플랜이 확인되면 vercel.json의 schedule만 `0,30 * * * *` 등으로 조이면 된다(코드 변경 0).
//
// 멱등성: 호출하는 RPC 4개가 전부 "조건에 맞는 행만 골라 상태를 바꾸는" 방식이라
//   두 번 돌아도 결과가 같다. Vercel 크론은 **중복 실행·누락이 둘 다 가능**하다고 문서에
//   명시돼 있어(best effort) 이 성질이 필수다.
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isRecurringEnabled } from "@/app/api/billing/checkout/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** 승인되지 않은 결제 시도를 닫기까지의 대기시간(분). 노티 재전송 최악 100분을 넉넉히 넘긴다. */
const STALE_CHECKOUT_MINUTES = 360
/** 기간 만료 후 유예(일). 법적/UX 근거는 BILLING-PLAN 함정 3 — 즉시 강등 금지. */
const GRACE_DAYS = 3
/** 며칠 전에 고지할지. 여신전문금융업법 시행령 기준 7일. */
const NOTICE_DAYS = 7

type Summary = {
  ranAt: string
  staleClosed: number | null
  cancelEffected: number | null
  lapsed: number | null
  expired: number | null
  noticesSent: number | null
  recurring: boolean
  errors: string[]
}

async function runSweep(): Promise<Summary> {
  const admin = createAdminClient()
  const errors: string[] = []
  const out: Summary = {
    ranAt: new Date().toISOString(),
    staleClosed: null,
    cancelEffected: null,
    lapsed: null,
    expired: null,
    noticesSent: null,
    // 자동 갱신(빌링키)은 아직 미승인이라 갱신 결제를 시도할 수 없다.
    // 승인되면 여기서 renew를 부르게 되고, 그 전까지는 lapse가 만료를 처리한다.
    recurring: isRecurringEnabled(),
    errors,
  }

  // ① 승인되지 않은 채 남은 결제 시도 정리
  {
    const { data, error } = await admin.rpc("billing_fail_stale_checkouts", { p_minutes: STALE_CHECKOUT_MINUTES })
    if (error) errors.push(`stale:${error.message}`)
    else out.staleClosed = data ?? 0
  }

  // ② 해지 예약일 도래 → 구독 종료 (마이그140)
  {
    const { data, error } = await admin.rpc("billing_expire_due")
    if (error) errors.push(`expire_due:${error.message}`)
    else out.cancelEffected = data ?? 0
  }

  // ③ 기간 만료 → 유예(past_due) → 종료(expired + free) (마이그141)
  {
    const { data, error } = await admin.rpc("billing_lapse_due", { p_grace_days: GRACE_DAYS })
    if (error) errors.push(`lapse:${error.message}`)
    else {
      const j = (data ?? {}) as { lapsed?: number; expired?: number }
      out.lapsed = j.lapsed ?? 0
      out.expired = j.expired ?? 0
    }
  }

  // ④ 결제/만료 7일 전 고지 (법적 의무②, 마이그141)
  {
    const { data, error } = await admin.rpc("billing_notice_upcoming", { p_days: NOTICE_DAYS })
    if (error) errors.push(`notice:${error.message}`)
    else out.noticesSent = data ?? 0
  }

  if (errors.length > 0) console.error("[billing/reconcile] errors:", errors)
  else console.log("[billing/reconcile]", JSON.stringify(out))
  return out
}

/**
 * 크론 진입점. Vercel은 `Authorization: Bearer $CRON_SECRET` 헤더를 붙여 **GET**으로 부른다
 * (2026-08-19 문서 확인). 크론은 리다이렉트를 따라가지 않으므로 이 경로는 proxy.ts
 * OPEN_PATHS에 있어야 한다 — 없으면 /login 리다이렉트를 받고 조용히 아무것도 안 한다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const summary = await runSweep()
  return Response.json({ ok: summary.errors.length === 0, ...summary })
}

/**
 * 지연 대사 — 결제 화면에 들어올 때 브라우저가 부른다.
 * 크론이 하루 1회뿐이라(위 주석) 화면에서 보이는 상태가 최대 하루까지 낡을 수 있다.
 * `credit_sync`가 지연 방식을 택한 것과 같은 이유로, 크론이 죽어도 화면은 맞게 보이게 한다.
 *
 * 로그인 사용자만 부를 수 있다. 하는 일이 전부 멱등이고 대상 행 수에 비례하므로(보통 0건)
 * 반복 호출로 얻을 게 없다.
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("로그인이 필요해요.", { status: 401 })

  const summary = await runSweep()
  return Response.json({ ok: summary.errors.length === 0, ...summary })
}
