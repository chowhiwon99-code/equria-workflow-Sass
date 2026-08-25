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
import { fieldClass } from "@/components/shared/Modal"
import { PLANS } from "@/lib/plans"
import { quoteAmountKrw, formatKrw, type PayablePlan } from "@/lib/billing/orders"

// ⚠️ 연간 결제는 나이스페이 심사 요구("서비스 제공기간 3개월 초과 상품 판매불가")로
//    2026-08-25 판매 중단. 월 결제만 받는다. 재개 시 git history의 토글 UI 참고.
const CYCLE = "monthly" as const

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

// ── 카드 입력 → 빌키 발급 ──────────────────────────────────────────────────
//
// 나이스페이 포스타트 담당자 회신(2026-08-20):
//   "빌키 발급/승인/삭제 부분만 개발가이드로 안내드리고 있어, 그 외 상품 구축, 자동결제 기능,
//    카드정보입력창 등은 귀사에서 직접 개발 및 구축해주셔야 합니다."
//   → 결제창 SDK를 띄우지 않는다. 이 화면이 카드정보 입력창이고, 서버가 암호화해 빌키를 받는다.
//
// 🔴 카드 원문은 이 컴포넌트 state → 서버 요청 본문까지만 존재한다.
//    localStorage·URL·로그·에러 메시지에 절대 넣지 않는다. 성공하면 즉시 비운다.
//    (서버 역시 암호화 직전까지만 들고 있고 DB에는 bid와 끝 4자리만 남긴다.)

type CardForm = { cardNo: string; exp: string; idNo: string; cardPw: string }

const EMPTY_CARD: CardForm = { cardNo: "", exp: "", idNo: "", cardPw: "" }

/** 카드번호 4자리씩 띄우기 — 입력 오류를 눈으로 잡게 한다. */
function formatCardNo(v: string): string {
  return v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim()
}
/** MM/YY */
function formatExp(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4)
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`
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
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [card, setCard] = useState<CardForm>(EMPTY_CARD)

  const amount = quoteAmountKrw(plan, CYCLE)
  const def = PLANS[plan]
  // 자동 갱신이 기본이므로 동의는 항상 필수다(법적 의무① — 회원가입 약관과 별도 사전 동의).
  const needConsent = recurringEnabled
  // 카드 4칸이 형식상 채워졌는가. 최종 검증은 서버(parseCard)와 카드사가 한다.
  const cardFilled =
    card.cardNo.replace(/\D/g, "").length >= 15 &&
    card.exp.replace(/\D/g, "").length === 4 &&
    [6, 10].includes(card.idNo.replace(/\D/g, "").length) &&
    card.cardPw.replace(/\D/g, "").length === 2
  const blocked = !billingConfigured || (needConsent && !agreed) || !cardFilled

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
      const digits = (v: string) => v.replace(/\D/g, "")
      const exp = digits(card.exp)
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ★금액을 보내지 않는다. 서버가 plan/cycle로 다시 계산한다.
        // 카드 원문은 이 요청에만 담기고, 서버는 암호화 후 즉시 버린다(DB 저장 없음).
        body: JSON.stringify({
          plan,
          cycle: CYCLE,
          autoBillingConsent: agreed,
          card: {
            cardNo: digits(card.cardNo),
            expMonth: exp.slice(0, 2),
            expYear: exp.slice(2, 4),
            idNo: digits(card.idNo),
            cardPw: digits(card.cardPw),
          },
        }),
      })
      if (!res.ok) {
        toast.error(await res.text())
        return
      }
      // 성공 — 카드 원문을 즉시 비운다(화면에 남겨둘 이유가 없다).
      setCard(EMPTY_CARD)
      toast.success("결제가 완료됐어요. 요금제가 바로 적용됩니다.")
      router.refresh()
    } catch {
      toast.error("결제에 실패했어요. 잠시 후 다시 시도해 주세요.")
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

        <div className="grid gap-3 sm:grid-cols-2">
          {PAYABLE.map((p) => {
            const on = plan === p
            const price = quoteAmountKrw(p, CYCLE)
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
                <span className="text-xs text-muted-foreground">/월 · {PLANS[p].seats}명까지</span>
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
            <span className="text-sm font-medium">{def.label} 월 정액 구독</span>
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

        {/* 🔴 카드정보 입력창 — 카드사 승인심사 필수 요건(카드번호·유효기간·생년월일·비밀번호 앞2자리).
            나이스페이 포스타트는 결제창을 주지 않으므로 이 화면이 곧 결제 수단 입력창이다.
            값은 서버로만 보내고 저장하지 않는다(autoComplete="off" · 비밀번호는 password 타입). */}
        <div className="flex flex-col gap-3 rounded-xl border p-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">카드 정보</h3>
            <span className="text-[11px] text-muted-foreground">안전하게 암호화되어 전송돼요</span>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">카드번호</span>
            <input
              className={fieldClass}
              inputMode="numeric"
              autoComplete="off"
              placeholder="0000 0000 0000 0000"
              value={card.cardNo}
              onChange={(e) => setCard((c) => ({ ...c, cardNo: formatCardNo(e.target.value) }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">유효기간 (MM/YY)</span>
              <input
                className={fieldClass}
                inputMode="numeric"
                autoComplete="off"
                placeholder="MM/YY"
                value={card.exp}
                onChange={(e) => setCard((c) => ({ ...c, exp: formatExp(e.target.value) }))}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">비밀번호 앞 2자리</span>
              <input
                className={fieldClass}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="••"
                maxLength={2}
                value={card.cardPw}
                onChange={(e) => setCard((c) => ({ ...c, cardPw: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">생년월일 6자리 (법인카드는 사업자번호 10자리)</span>
            <input
              className={fieldClass}
              inputMode="numeric"
              autoComplete="off"
              placeholder="YYMMDD"
              maxLength={10}
              value={card.idNo}
              onChange={(e) => setCard((c) => ({ ...c, idNo: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
            />
          </label>
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
          {/* 자동 갱신은 이제 기본이다(빌키). recurringEnabled가 false인 경우는 자격증명이 없을
              때뿐이고, 그건 아래 "결제 준비 중" 안내가 이미 알려주므로 여기서 중복 설명하지 않는다. */}
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
