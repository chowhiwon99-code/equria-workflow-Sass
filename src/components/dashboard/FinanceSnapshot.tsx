"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Receipt } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { currentYM, monthRange } from "@/components/shared/MonthStepper"
import { money } from "@/lib/finance"
import { aggregateByCurrency, type SumRow } from "@/components/finance/financeAgg"
import { Surface } from "@/components/shared/Surface"

// 대시보드 손익 스냅샷(세션41 랜딩 목업 정합) — 이번 달 손익 필 3개 + 최근 기록 카드.
// 노출: 게스트/무소속 숨김 · 관리자/오너 항상 · 멤버는 설정 '대시보드 손익 공개'가 켜졌을 때만(/api/finance-snapshot).
// 필은 KRW만 집계(통화 혼합 금지 — 다통화 상세는 재무 탭이 정식 화면).

type RecentRow = SumRow & { vendor: string | null; description: string | null }

export function FinanceSnapshot({ today }: { today: React.ReactNode }) {
  const supabase = createClient()
  const [canView, setCanView] = useState<boolean | null>(null) // null = 판별 중
  const [sums, setSums] = useState<SumRow[]>([])
  const [recent, setRecent] = useState<RecentRow[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/finance-snapshot")
      if (!res.ok) throw new Error()
      const gate = (await res.json()) as { canView: boolean }
      setCanView(gate.canView)
      if (!gate.canView) return
      const range = monthRange(currentYM())
      const [sumRes, recentRes] = await Promise.all([
        supabase
          .from("finance_entries")
          .select("kind, category, total_amount, currency, entry_date")
          .is("deleted_at", null)
          .gte("entry_date", range.start)
          .lt("entry_date", range.end),
        supabase
          .from("finance_entries")
          .select("kind, category, vendor, description, total_amount, currency, entry_date")
          .is("deleted_at", null)
          .order("entry_date", { ascending: false })
          .limit(5),
      ])
      setSums((sumRes.data as SumRow[]) ?? [])
      setRecent((recentRes.data as RecentRow[]) ?? [])
    } catch {
      setCanView(false) // 조회 실패는 대시보드를 막지 않음 — 스냅샷만 숨김
    }
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 스냅샷 로드(코드베이스 공통 데이터 로딩 패턴)
    load()
  }, [load])

  // 숨김(게스트·비공개·판별 중) — 오늘 할 일만 전폭으로
  if (!canView) return <>{today}</>

  const krw = aggregateByCurrency(sums)["KRW"] ?? { revenue: 0, expense: 0 }
  const net = krw.revenue - krw.expense

  return (
    <>
      {/* 손익 요약 필 — 랜딩 목업과 동일 언어(파스텔 필 3개, 배경 위 직접) */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <span className="mr-1 inline-flex items-center gap-1.5 text-sm font-semibold">
          <Receipt className="size-4 text-primary" /> 이번 달 손익
        </span>
        <span className="rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success tabular-nums">
          매출 {money(krw.revenue, "KRW")}
        </span>
        <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-500 tabular-nums">
          비용 {money(krw.expense, "KRW")}
        </span>
        <span className="rounded-full bg-info-bg px-2.5 py-1 text-xs font-semibold text-info tabular-nums">
          순이익 {money(net, "KRW")}
        </span>
        <Link href="/finance" className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground">
          재무 보기 →
        </Link>
      </div>

      {/* 오늘 할 일 | 최근 기록 — 랜딩 목업의 2열 화이트 카드 */}
      <div className="grid shrink-0 gap-3 md:grid-cols-2">
        {today}
        <Surface padding="none" className="rounded-xl p-3">
          <h2 className="mb-1.5 text-sm font-semibold">최근 기록</h2>
          {recent.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">아직 기록이 없어요. 재무에서 첫 기록을 남겨보세요.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {recent.map((r, i) => {
                const label = r.vendor || r.description || r.category || (r.kind === "revenue" ? "매출" : "비용")
                const isRevenue = r.kind === "revenue"
                return (
                  <div key={i} className="flex items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="truncate">{label}</span>
                    <span className={isRevenue ? "shrink-0 font-medium text-success tabular-nums" : "shrink-0 text-muted-foreground tabular-nums"}>
                      {isRevenue ? "+" : "−"}
                      {money(Number(r.total_amount), r.currency)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Surface>
      </div>
    </>
  )
}
