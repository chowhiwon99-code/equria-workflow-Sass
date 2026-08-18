"use client"

// 요금제·구독 카드 (오너 전용) — 현재 상태 표시 + **24시간 해지**.
//
// 해지 버튼이 여기 있는 이유는 법적 의무다. 나이스페이 계약 제22조 ④-2:
//   "정기결제 고객사는 정규 영업시간 외에도 이용자가 철회·취소·해지를 신청할 수 있도록
//    채널을 운영하여야 한다."
// 이메일 문의만으로는 미달이라 앱에서 언제나 눌러 끊을 수 있어야 한다.
//
// ⚠️ 문구에 **"충전·크레딧·포인트" 금지**(PG 위험업종 분류 회피 — lib/credits.ts 상단 규칙).
//    상품명은 "월 정액 구독"/"연간 구독", 사용량은 "AI 사용량"으로만 쓴다.
//
// 데이터는 billing_subscriptions를 클라이언트에서 직접 읽는다(RLS가 멤버 select 허용, 마이그139).
// 반면 해지·철회는 RPC가 service_role 전용이라 반드시 API 라우트를 거친다.
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { Button } from "@/components/ui/button"
import { planOf } from "@/lib/plans"
import { formatKrw } from "@/lib/billing/orders"

type Sub = {
  plan: string
  status: string
  billing_cycle: string
  amount_krw: number
  current_period_end: string
  cancel_effective_at: string | null
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })

/** 카드 셸 — SettingsView의 로컬 Card와 같은 모양(자체 완결형 카드 관례, McpCredentialsCard와 동일). */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl glass p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">요금제</h2>
        <p className="text-xs text-muted-foreground">현재 이용 중인 요금제와 결제 상태예요.</p>
      </div>
      {children}
    </section>
  )
}

/** 값 한 줄 — SettingsView의 정보 행 마크업과 동일. */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

export function BillingCard() {
  const supabase = createClient()
  const wsId = useCurrentWorkspaceId()
  const [plan, setPlan] = useState<string | null>(null)
  const [sub, setSub] = useState<Sub | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!wsId) return
    const [{ data: ws }, { data: s }] = await Promise.all([
      supabase.from("workspaces").select("plan").eq("id", wsId).maybeSingle(),
      supabase
        .from("billing_subscriptions")
        .select("plan, status, billing_cycle, amount_krw, current_period_end, cancel_effective_at")
        .eq("workspace_id", wsId)
        .maybeSingle(),
    ])
    setPlan(ws?.plan ?? null)
    setSub((s as Sub | null) ?? null)
    setLoaded(true)
  }, [supabase, wsId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 로드
    void load()
  }, [load])

  async function cancel() {
    setBusy(true)
    const res = await fetch("/api/billing/subscription/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    })
    setBusy(false)
    if (!res.ok) return toast.error(await res.text())
    // ⚠️ 원본 2단계 확인 패턴(SettingsView 멤버 삭제)은 행이 사라져서 리셋이 없다.
    //    여기는 카드가 남으므로 명시적으로 되돌려야 확인 문구가 계속 떠 있지 않는다.
    setConfirming(false)
    setReason("")
    toast.success("해지를 신청했어요. 결제한 기간까지는 그대로 쓸 수 있어요.")
    void load()
  }

  async function revoke() {
    setBusy(true)
    const res = await fetch("/api/billing/subscription/cancel", { method: "DELETE" })
    setBusy(false)
    if (!res.ok) return toast.error(await res.text())
    toast.success("해지를 취소했어요. 구독이 계속 유지돼요.")
    void load()
  }

  if (!wsId || !loaded) return null

  // ── 협의 요금제(자사 내부 무제한) — 결제 대상이 아니라 구독 행 자체를 만들지 않는다.
  if (plan === "premium") {
    return (
      <Shell>
        <div className="overflow-hidden rounded-xl border">
          <Row label="현재 요금제" value="협의 요금제" />
        </div>
        <p className="text-xs text-muted-foreground">별도 계약으로 이용 중이라 결제 설정이 없어요.</p>
      </Shell>
    )
  }

  // ── 구독이 없거나 이미 종료됨 → 무료 상태
  const ended = !sub || sub.status === "canceled" || sub.status === "expired"
  if (ended) {
    return (
      <Shell>
        <div className="overflow-hidden rounded-xl border">
          <Row label="현재 요금제" value={planOf(plan).label} />
        </div>
        <p className="text-xs text-muted-foreground">
          {sub ? "구독이 종료됐어요. 언제든 다시 시작할 수 있어요." : "유료 요금제로 올리면 AI 사용량과 인원이 늘어나요."}
        </p>
        {/* 이 프로젝트의 Button은 asChild를 지원하지 않는다(base-ui 래핑 없이 cva만 사용).
            CreditMeter.tsx:83과 같이 Link에 직접 스타일을 준다. */}
        <Link
          href="/billing"
          className="inline-flex h-9 w-full items-center justify-center rounded-lg border text-sm font-medium transition-colors hover:bg-accent"
        >
          요금제 보기
        </Link>
      </Shell>
    )
  }

  const cycleLabel = sub.billing_cycle === "yearly" ? "연간" : "월"
  const canceling = !!sub.cancel_effective_at

  return (
    <Shell>
      <div className="flex flex-col divide-y overflow-hidden rounded-xl border">
        <Row label="현재 요금제" value={`${planOf(sub.plan).label} · ${cycleLabel}`} />
        <Row label="결제 금액" value={`${formatKrw(sub.amount_krw)} (부가세 포함)`} />
        <Row
          label={canceling ? "이용 종료일" : "다음 결제일"}
          value={fmtDate(sub.cancel_effective_at ?? sub.current_period_end)}
        />
      </div>

      {/* 결제 실패 — 요금제를 즉시 내리지 않는다(한도초과·카드 재발급은 정상 빈도라 유예를 둔다). */}
      {sub.status === "past_due" && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          결제가 확인되지 않았어요. 다시 시도하는 동안에도 요금제는 그대로 유지돼요.
        </p>
      )}

      {canceling ? (
        <>
          <p className="text-xs text-muted-foreground">
            {fmtDate(sub.cancel_effective_at!)}에 종료돼요. 그때까지는 지금 요금제를 그대로 쓸 수 있어요.
          </p>
          <Button variant="outline" className="w-full" onClick={revoke} disabled={busy}>
            해지 취소하고 계속 이용하기
          </Button>
        </>
      ) : confirming ? (
        <div className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs">
            <b>{fmtDate(sub.current_period_end)}</b>까지는 그대로 이용할 수 있고, 그다음 결제부터 청구되지 않아요.
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="해지 이유를 알려주시면 개선에 쓸게요 (선택)"
            className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="destructive" onClick={cancel} disabled={busy}>
              해지하기
            </Button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              그만두기
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive"
        >
          구독 해지
        </button>
      )}
    </Shell>
  )
}
