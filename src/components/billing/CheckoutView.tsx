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
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { PLANS, YEARLY_FREE_MONTHS } from "@/lib/plans"
import { quoteAmountKrw, formatKrw, type BillingCycle, type PayablePlan } from "@/lib/billing/orders"

const PAYABLE: PayablePlan[] = ["standard", "pro"]

/** return 라우트가 붙여 보내는 reason → 사용자에게 보일 문구. 기술 용어를 그대로 노출하지 않는다. */
const FAIL_MESSAGE: Record<string, string> = {
  auth: "결제 인증이 완료되지 않았어요.",
  declined: "카드사에서 결제가 거절됐어요. 다른 카드로 시도해 보세요.",
  reverted: "결제 처리 중 문제가 생겨 자동으로 취소했어요. 금액은 청구되지 않아요.",
  settle_error: "결제는 승인됐지만 처리 중 문제가 생겼어요. 곧 자동으로 확인되며, 반영되지 않으면 문의해 주세요.",
  unknown_order: "주문 정보를 찾을 수 없어요. 다시 시도해 주세요.",
  bad_request: "결제 요청이 올바르지 않아요. 다시 시도해 주세요.",
}

// ── 나이스페이 결제창(PC/모바일) 호출부 ────────────────────────────────────────
//
// 규격 출처(2026-08-19 확인, developers.nicepay.co.kr/manual-auth.php):
//   · SDK: https://pg-web.nicepay.co.kr/v3/common/js/nicepay-pgweb.js
//   · 호출: goPay(form)  — form 객체를 통째로 넘긴다
//   · 필수 input: PayMethod · GoodsName · Amt · MID · Moid · EdiDate · SignData · ReturnURL
//   · PC 결제창은 가맹점 페이지에 **전역 함수 2개**가 있어야 동작한다:
//       nicepaySubmit() — 인증이 끝나면 SDK가 부른다. 우리는 form을 ReturnURL로 submit한다.
//       nicepayClose()  — 사용자가 결제창을 닫으면 SDK가 부른다.
//     모바일은 콜백 없이 ReturnURL로 바로 리다이렉트된다.
//
// 🔴 form을 React로 그리지 않고 **DOM에 직접 만든다.**
//    SDK가 인증 결과(AuthToken·NextAppURL·TxTid…)를 이 form 안에 input으로 **써 넣은 뒤**
//    submit하는데, React가 소유한 DOM이면 리렌더가 그 input들을 지워버릴 수 있다.
//    그러면 승인에 필요한 값이 사라져 결제가 조용히 실패한다.
const NICEPAY_SDK = "https://pg-web.nicepay.co.kr/v3/common/js/nicepay-pgweb.js"

type CheckoutParams = {
  mid: string
  moid: string
  amt: number
  /** 상품명은 **서버가 만든 값**을 그대로 쓴다. 화면에서 다시 조립하면 영수증·심사자료와 어긋난다. */
  goodsName: string
  ediDate: string
  signData: string
  returnUrl: string
}

declare global {
  interface Window {
    goPay?: (form: HTMLFormElement) => void
    nicepaySubmit?: () => void
    nicepayClose?: () => void
  }
}

/** SDK를 한 번만 로드한다. 이미 있으면 즉시 resolve. */
function loadNicepaySdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (window.goPay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${NICEPAY_SDK}"]`)
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("sdk")), { once: true })
      return
    }
    const el = document.createElement("script")
    el.src = NICEPAY_SDK
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error("sdk"))
    document.head.appendChild(el)
  })
}

function openNicepayWindow(c: CheckoutParams, onClosed: () => void) {
  const form = document.createElement("form")
  form.name = "payForm" // SDK가 document.payForm으로 참조할 수 있게 이름을 준다
  form.method = "post"
  form.action = c.returnUrl // 인증이 끝나면 이 주소로 POST된다(= 우리 return 라우트)
  form.acceptCharset = "utf-8"
  form.style.display = "none"

  const add = (name: string, value: string | number) => {
    const i = document.createElement("input")
    i.type = "hidden"
    i.name = name
    i.value = String(value)
    form.appendChild(i)
  }
  // 바로오픈 기간에는 신용카드만 즉시 승인된다(나이스페이 담당자 회신 2026-08-19).
  add("PayMethod", "CARD")
  add("GoodsName", c.goodsName)
  add("Amt", c.amt)
  add("MID", c.mid)
  add("Moid", c.moid)
  add("EdiDate", c.ediDate)
  add("SignData", c.signData)
  add("ReturnURL", c.returnUrl)
  // ⚠️ 문서상 GoodsName은 euc-kr 규격이다. 페이지가 utf-8이라 CharSet=utf-8로 요청하는데,
  //    실키로 결제창을 한 번 띄워 **상품명 한글이 깨지지 않는지** 반드시 확인할 것.
  //    깨지면 상품명을 영문으로 바꾸거나 euc-kr 인코딩 폼으로 전환해야 한다.
  add("CharSet", "utf-8")

  document.body.appendChild(form)

  const cleanup = () => {
    delete window.nicepaySubmit
    delete window.nicepayClose
    form.remove()
  }
  // PC 결제창: 인증 완료 → SDK가 form에 결과를 채운 뒤 이걸 부른다.
  window.nicepaySubmit = () => form.submit()
  // PC 결제창: 사용자가 창을 닫음. 'ready' 행은 크론이 정리한다(결제는 일어나지 않았다).
  window.nicepayClose = () => {
    cleanup()
    onClosed()
  }

  window.goPay?.(form)
}

export function CheckoutView({
  currentPlan,
  billingConfigured,
  recurringEnabled,
}: {
  currentPlan: string | null
  billingConfigured: boolean
  recurringEnabled: boolean
}) {
  const router = useRouter()
  const [plan, setPlan] = useState<PayablePlan>("standard")
  const [cycle, setCycle] = useState<BillingCycle>("monthly")
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)

  const amount = quoteAmountKrw(plan, cycle)
  const def = PLANS[plan]
  // 자동 갱신을 쓸 수 있을 때만 동의가 의미 있다. 못 쓰는 지금은 동의를 강제하지 않는다.
  const needConsent = recurringEnabled
  const blocked = !billingConfigured || (needConsent && !agreed)

  // 결제창에서 돌아왔을 때(return 라우트가 /billing?result=... 로 보낸다) 결과를 알린다.
  // 함께 **지연 대사**를 한 번 돌린다 — 크론이 하루 1회뿐이라(Vercel Hobby 제한) 화면 상태가
  // 최대 하루까지 낡을 수 있다. credit_sync가 지연 방식을 택한 것과 같은 이유다.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const result = sp.get("result")
    if (!result) return
    if (result === "ok") toast.success("결제가 완료됐어요. 요금제가 바로 적용됩니다.")
    else if (result === "pending") toast("결제 확인 중이에요. 확인되면 자동으로 반영됩니다.")
    else toast.error(FAIL_MESSAGE[sp.get("reason") ?? ""] ?? "결제가 완료되지 않았어요.")

    // 대사는 실패해도 화면이 깨지지 않게 조용히 넘긴다(크론이 다시 처리한다).
    void fetch("/api/billing/reconcile", { method: "POST" })
      .catch(() => {})
      .finally(() => router.refresh()) // 서버에서 받은 현재 요금제를 새로 읽어온다
    // 새로고침 때 같은 토스트가 또 뜨지 않도록 쿼리만 지운다.
    window.history.replaceState({}, "", window.location.pathname)
  }, [router])

  async function start() {
    setBusy(true)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ★금액을 보내지 않는다. 서버가 plan/cycle로 다시 계산한다.
        body: JSON.stringify({ plan, cycle, autoBillingConsent: agreed }),
      })
      if (!res.ok) {
        toast.error(await res.text())
        return
      }
      const data = (await res.json()) as { checkout: CheckoutParams }
      await loadNicepaySdk()
      // 여기서부터는 나이스페이 결제창이 화면을 가져간다. 인증이 끝나면 SDK가
      // nicepaySubmit()을 불러 return 라우트로 POST하고, 승인·정산은 서버가 한다.
      openNicepayWindow(data.checkout, () => toast("결제를 취소했어요."))
    } catch {
      toast.error("결제창을 여는 데 실패했어요. 잠시 후 다시 시도해 주세요.")
    } finally {
      setBusy(false)
    }
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
