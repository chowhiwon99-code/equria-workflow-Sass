"use client"

// 결제 시작 화면 — 요금제 선택 · 금액 확인 · **자동결제 별도 동의** · 결제.
//
// 🔴 자동결제 동의를 이 화면에 둔 이유(법적 의무①):
//    나이스페이 계약 제22조 ③ — "쇼핑몰 회원가입 약관과는 **별도로** 자동결제 서비스 관련 약관을
//    고지하고 **사전 동의**를 득해야 하며, 위반 시 이용자 민원·손해배상 클레임 일체를 고객사가 부담".
//    → 가입 동의에 끼워 넣으면 동의가 없는 것으로 본다. 결제 직전 별도 체크박스로 받는다.
//
// ⚠️ 금액은 화면에서 계산한 값을 **서버로 보내지 않는다.** plan/cycle만 보내고 서버가 다시 계산한다
//    (api/billing/checkout 주석 참조). 여기 표시되는 금액은 안내용일 뿐이다.
//
// ⚠️ 문구에 "충전·크레딧·포인트" 금지(PG 위험업종 분류 회피).
import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { PLANS, YEARLY_FREE_MONTHS } from "@/lib/plans"
import { quoteAmountKrw, formatKrw, type BillingCycle, type PayablePlan } from "@/lib/billing/orders"

const PAYABLE: PayablePlan[] = ["standard", "pro"]

export function CheckoutView({
  currentPlan,
  billingConfigured,
  recurringEnabled,
}: {
  currentPlan: string | null
  billingConfigured: boolean
  recurringEnabled: boolean
}) {
  const [plan, setPlan] = useState<PayablePlan>("standard")
  const [cycle, setCycle] = useState<BillingCycle>("monthly")
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)

  const amount = quoteAmountKrw(plan, cycle)
  const def = PLANS[plan]
  // 자동 갱신을 쓸 수 있을 때만 동의가 의미 있다. 못 쓰는 지금은 동의를 강제하지 않는다.
  const needConsent = recurringEnabled
  const blocked = !billingConfigured || (needConsent && !agreed)

  async function start() {
    setBusy(true)
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ★금액을 보내지 않는다. 서버가 plan/cycle로 다시 계산한다.
      body: JSON.stringify({ plan, cycle, autoBillingConsent: agreed }),
    })
    setBusy(false)
    if (!res.ok) return toast.error(await res.text())
    toast.success("결제창을 준비했어요.")
    // 결제창 호출은 나이스페이 자격증명이 주입된 뒤 lib/billing/nicepay.ts가 담당한다.
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {/* 요금제 선택 */}
      <section className="flex flex-col gap-4 rounded-2xl glass p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">요금제 선택</h2>
          <p className="text-xs text-muted-foreground">회사 단위로 결제하고, 인원은 요금제에 포함돼요.</p>
        </div>

        {/* 월/연 토글 — 연간은 2개월치가 빠진다 */}
        <div className="flex items-center gap-1 self-start rounded-full border p-1">
          {(["monthly", "yearly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                cycle === c ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c === "monthly" ? "월 결제" : `연 결제 · ${YEARLY_FREE_MONTHS}개월 무료`}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {PAYABLE.map((p) => {
            const on = plan === p
            const price = quoteAmountKrw(p, cycle)
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPlan(p)}
                className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
                  on ? "border-foreground" : "hover:bg-accent"
                }`}
              >
                <span className="text-sm font-bold">{PLANS[p].label}</span>
                <span className="text-lg font-extrabold">{formatKrw(price)}</span>
                <span className="text-xs text-muted-foreground">
                  {cycle === "yearly" ? "/년" : "/월"} · {PLANS[p].seats}명까지
                </span>
                {currentPlan === p && <span className="text-[11px] font-medium text-muted-foreground">현재 요금제</span>}
              </button>
            )
          })}
        </div>
      </section>

      {/* 결제 요약 */}
      <section className="flex flex-col gap-4 rounded-2xl glass p-5">
        <h2 className="text-base font-semibold">결제 정보</h2>
        <div className="flex flex-col divide-y overflow-hidden rounded-xl border">
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-sm text-muted-foreground">상품</span>
            <span className="text-sm font-medium">
              {def.label} {cycle === "yearly" ? "연간 구독" : "월 정액 구독"}
            </span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-sm text-muted-foreground">결제 금액</span>
            <span className="text-sm font-semibold">{formatKrw(amount)}</span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-sm text-muted-foreground">부가세</span>
            <span className="text-sm font-medium">포함</span>
          </div>
        </div>

        {/* 🔴 자동결제 동의 — 회원가입 약관과 물리적으로 분리된 별도 체크박스 */}
        <div className="flex flex-col gap-2 rounded-xl border p-3.5">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={agreed}
              disabled={!recurringEnabled}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span className="text-sm">
              <b>자동 갱신</b>에 동의합니다 {needConsent && <span className="text-destructive">(필수)</span>}
              <br />
              <span className="text-xs text-muted-foreground">
                기간이 끝나면 자동으로 결제됩니다. 언제든 설정에서 해지할 수 있고, 금액이 바뀌면 7일 전에 알려드려요.{" "}
                <Link href="/terms/billing" target="_blank" className="underline underline-offset-2">
                  자동결제 약관
                </Link>
              </span>
            </span>
          </label>
          {!recurringEnabled && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              자동 갱신은 아직 준비 중이에요. 이번 결제는 <b>1회 결제</b>로 진행되고, 기간이 끝나면 다시 결제하시면 돼요.
            </p>
          )}
        </div>

        {!billingConfigured && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            결제 준비 중이에요. 결제 수단 심사가 끝나면 바로 열립니다.
          </p>
        )}

        <Button className="w-full" onClick={start} disabled={blocked || busy}>
          {busy ? "준비 중…" : billingConfigured ? `${formatKrw(amount)} 결제하기` : "결제 준비 중"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          결제 시 <Link href="/terms" className="underline underline-offset-2">이용약관</Link> ·{" "}
          <Link href="/refund" className="underline underline-offset-2">환불정책</Link>에 동의하는 것으로 봅니다.
        </p>
      </section>
    </div>
  )
}
