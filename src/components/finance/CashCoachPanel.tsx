"use client"

import { useCallback, useEffect, useState } from "react"
import { Sparkles, X, RefreshCw, TrendingDown, TrendingUp, Minus, AlertTriangle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { CashAccount, CashCategory } from "@/types"
import type { CashSummary } from "@/lib/cashflowGraph"
import { buildCoachPayload, type CoachTrend } from "@/lib/cashCoach"
import type { CashCoachResult } from "@/lib/claude/schemas"
import { buildMonthlyTrend, type SumRow } from "./financeAgg"
import { currentYM, monthRange } from "@/components/shared/MonthStepper"

const LEVEL: Record<CashCoachResult["health"]["level"], { label: string; cls: string }> = {
  good: { label: "양호", cls: "bg-emerald-500/10 text-emerald-600" },
  caution: { label: "주의", cls: "bg-amber-500/10 text-amber-600" },
  warning: { label: "경고", cls: "bg-rose-500/10 text-rose-600" },
}
const SEV: Record<CashCoachResult["anomalies"][number]["severity"], { cls: string; dot: string }> = {
  info: { cls: "text-blue-600", dot: "bg-blue-500" },
  caution: { cls: "text-amber-600", dot: "bg-amber-500" },
  warning: { cls: "text-rose-600", dot: "bg-rose-500" },
}
const DIR: Record<CashCoachResult["trends"][number]["direction"], { Icon: typeof TrendingUp; cls: string }> = {
  up: { Icon: TrendingUp, cls: "text-emerald-600" },
  down: { Icon: TrendingDown, cls: "text-rose-600" },
  flat: { Icon: Minus, cls: "text-muted-foreground" },
}
const METRIC: Record<CashCoachResult["trends"][number]["metric"], string> = {
  revenue: "매출",
  expense: "비용",
  profit: "순이익",
}

/**
 * 현금흐름 AI 코칭 패널 — 열리면 현재 손익 스냅샷을 1회 자동 분석.
 * 읽기 전용(저장 없음). 데이터를 바꾼 뒤 "다시 분석"으로 갱신.
 */
export function CashCoachPanel({
  slots,
  summaries,
  groups,
  defaultCurrency,
  onClose,
}: {
  slots: CashAccount[]
  summaries: CashSummary[]
  groups: CashCategory[]
  defaultCurrency: string
  onClose: () => void
}) {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CashCoachResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      // 실제 장부(finance_entries) 최근 6개월 추세 — 실패해도 코칭은 진행(추세만 생략).
      let trend: CoachTrend | undefined
      try {
        const anchor = currentYM()
        let sy = anchor.y
        let sm = anchor.m - 5
        while (sm <= 0) {
          sm += 12
          sy -= 1
        }
        const trendStart = monthRange({ y: sy, m: sm }).start
        const trendEnd = monthRange(anchor).end
        const { data } = await supabase
          .from("finance_entries")
          .select("kind, category, total_amount, currency, entry_date")
          .is("deleted_at", null)
          .gte("entry_date", trendStart)
          .lt("entry_date", trendEnd)
        const months = buildMonthlyTrend((data as SumRow[]) ?? [], defaultCurrency, anchor, 6).map((m) => ({
          label: m.label,
          revenue: m.revenue,
          expense: m.expense,
        }))
        if (months.some((m) => m.revenue !== 0 || m.expense !== 0)) trend = { currency: defaultCurrency, months }
      } catch {
        /* 추세 없이 진행 */
      }
      const payload = buildCoachPayload(slots, summaries, groups, trend)
      const res = await fetch("/api/finance/cashflow-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(j?.error ?? "분석에 실패했어요.")
      }
      const j = (await res.json()) as { result: CashCoachResult }
      setResult(j.result)
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }, [supabase, slots, summaries, groups, defaultCurrency])

  // 열릴 때 1회 자동 분석 (데이터 변경마다 재호출하지 않음 — 비용 방지)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const health = result?.health
  const savings = result?.savings ?? []
  const anomalies = result?.anomalies ?? []
  const trends = result?.trends ?? []

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-violet-500" /> AI 코칭
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={run}
            disabled={busy}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", busy && "animate-spin")} /> 다시 분석
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
            <X className="size-4" />
          </button>
        </div>
      </div>

      {busy && !result && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 현재 손익을 분석하고 있어요…
        </div>
      )}

      {error && !busy && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600">
          <span>{error}</span>
          <button onClick={run} className="shrink-0 font-medium underline underline-offset-2">
            다시
          </button>
        </div>
      )}

      {health && (
        <div className="flex flex-col gap-3">
          {/* 건강도 요약 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", LEVEL[health.level].cls)}>
                건강도 {LEVEL[health.level].label}
              </span>
              <span className="text-sm font-medium">{health.headline}</span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{health.summary}</p>
          </div>

          {/* 절감 제안 */}
          {savings.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <TrendingDown className="size-3.5 text-emerald-600" /> 절감 제안
              </h4>
              {savings.map((s, i) => (
                <div key={i} className="rounded-md border bg-background p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{s.title}</span>
                    {s.target && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{s.target}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.detail}</p>
                </div>
              ))}
            </div>
          )}

          {/* 이상 신호 */}
          {anomalies.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <AlertTriangle className="size-3.5 text-amber-600" /> 이상 신호
              </h4>
              {anomalies.map((a, i) => (
                <div key={i} className="rounded-md border bg-background p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("flex items-center gap-1.5 text-sm font-medium", SEV[a.severity].cls)}>
                      <span className={cn("size-1.5 rounded-full", SEV[a.severity].dot)} />
                      {a.title}
                    </span>
                    {a.target && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{a.target}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{a.detail}</p>
                </div>
              ))}
            </div>
          )}

          {/* 최근 추세 (실제 장부 기준) */}
          {trends.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <TrendingUp className="size-3.5 text-violet-500" /> 최근 추세
              </h4>
              {trends.map((t, i) => {
                const d = DIR[t.direction]
                return (
                  <div key={i} className="rounded-md border bg-background p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className={cn("flex items-center gap-1.5 text-sm font-medium", d.cls)}>
                        <d.Icon className="size-3.5" />
                        {t.title}
                      </span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {METRIC[t.metric]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t.detail}</p>
                  </div>
                )
              })}
            </div>
          )}

          {savings.length === 0 && anomalies.length === 0 && trends.length === 0 && (
            <p className="text-xs text-muted-foreground">지금은 눈에 띄는 절감 기회나 이상 신호가 없어요. 👍</p>
          )}
        </div>
      )}
    </div>
  )
}
