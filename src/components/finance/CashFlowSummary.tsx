"use client"

import { cn } from "@/lib/utils"
import { money } from "@/lib/finance"
import { tagBg } from "@/lib/meetingMeta"
import { slotCategory, type CashSummary } from "@/lib/cashflowGraph"
import type { CashAccount } from "@/types"

// 토스식 손익 요약 — 매출 → 회사 가용현금 → 비용 흐름(은은한 곡선, 두께=금액, 화살표 없음) + 항목 breakdown 막대.
export function CashFlowSummary({ slots, pool }: { slots: CashAccount[]; pool: CashSummary }) {
  const items = (flow: "income" | "expense") =>
    slots
      .filter((s) => slotCategory(s.kind) === flow && Number(s.amount) !== 0)
      .map((s) => ({ id: s.id, name: s.name, color: s.color, amount: Number(s.amount) }))
      .sort((a, b) => b.amount - a.amount)
  const revItems = items("income")
  const expItems = items("expense")
  const cur = pool.currency

  // 흐름 곡선 두께 = 금액 비례(√정규화)
  const maxFlow = Math.max(pool.revenue, pool.expense, 1)
  const w = (a: number) => 3 + 22 * Math.sqrt(Math.min(1, a / maxFlow))
  const negAvail = pool.available < 0
  const negProfit = pool.netProfit < 0

  return (
    <div className="flex flex-col gap-4">
      {/* 흐름 밴드: 매출 → 회사 가용현금 → 비용 */}
      <div className="overflow-x-auto rounded-2xl border bg-gradient-to-b from-muted/20 to-transparent p-3">
        <div className="relative mx-auto h-[180px] w-[720px]">
          <svg className="pointer-events-none absolute inset-0" width={720} height={180} aria-hidden>
            <path d={curve(158, 90, 282, 90)} fill="none" stroke="#10b981" strokeWidth={w(pool.revenue)} strokeLinecap="round" className="opacity-70" />
            <path d={curve(438, 90, 562, 90)} fill="none" stroke="#f43f5e" strokeWidth={w(pool.expense)} strokeLinecap="round" className="opacity-70" />
            <text x={220} y={78} textAnchor="middle" className="fill-foreground text-[11px] font-medium" style={{ paintOrder: "stroke", stroke: "var(--color-background)", strokeWidth: 3 }}>
              {money(pool.revenue, cur)}
            </text>
            <text x={500} y={78} textAnchor="middle" className="fill-foreground text-[11px] font-medium" style={{ paintOrder: "stroke", stroke: "var(--color-background)", strokeWidth: 3 }}>
              {money(pool.expense, cur)}
            </text>
          </svg>

          {/* 매출 총액 */}
          <SideCard className="left-2" tone="emerald" label="매출" value={money(pool.revenue, cur)} />
          {/* 회사 가용 현금(중앙) */}
          <div className="absolute left-1/2 top-1/2 w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-primary/30 bg-primary/[0.06] px-4 py-3 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)] ring-1 ring-primary/10">
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary/70">회사 가용 현금</p>
            <p className={cn("mt-0.5 text-[22px] font-bold leading-none tracking-tight tabular-nums", negAvail ? "text-rose-600" : "text-foreground")}>{money(pool.available, cur)}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums", negProfit ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600")}>
                순이익 {money(pool.netProfit, cur)}
              </span>
            </div>
            <p className="mt-1.5 text-[10px] tabular-nums text-muted-foreground">시작 {money(pool.opening, cur)} · 보유 {money(pool.reserve, cur)}</p>
          </div>
          {/* 비용 총액 */}
          <SideCard className="right-2" tone="rose" label="비용" value={money(pool.expense, cur)} />
        </div>
      </div>

      {/* 항목 breakdown */}
      <div className="grid gap-3 md:grid-cols-2">
        <BreakdownCard title="매출" tone="emerald" total={money(pool.revenue, cur)} items={revItems} cur={cur} />
        <BreakdownCard title="비용" tone="rose" total={money(pool.expense, cur)} items={expItems} cur={cur} />
      </div>
    </div>
  )
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(30, (x2 - x1) * 0.5)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

function SideCard({ className, tone, label, value }: { className: string; tone: "emerald" | "rose"; label: string; value: string }) {
  return (
    <div className={cn("absolute top-1/2 w-[152px] -translate-y-1/2 rounded-2xl border bg-card px-3.5 py-3 shadow-sm", className)}>
      <p className={cn("text-xs font-medium", tone === "emerald" ? "text-emerald-600" : "text-rose-600")}>{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function BreakdownCard({
  title,
  tone,
  total,
  items,
  cur,
}: {
  title: string
  tone: "emerald" | "rose"
  total: string
  items: { id: string; name: string; color: string; amount: number }[]
  cur: string
}) {
  const max = Math.max(1, ...items.map((i) => i.amount))
  return (
    <section className="flex flex-col gap-2 rounded-2xl border bg-card p-3.5">
      <div className="flex items-baseline justify-between">
        <h4 className={cn("text-sm font-semibold", tone === "emerald" ? "text-emerald-600" : "text-rose-600")}>{title}</h4>
        <span className="text-sm font-semibold tabular-nums">{total}</span>
      </div>
      {items.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">항목이 없어요.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tagBg(it.color, 90) }} />
              <span className="w-24 shrink-0 truncate text-xs">{it.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", tone === "emerald" ? "bg-emerald-500/70" : "bg-rose-500/70")}
                  style={{ width: `${Math.max(3, (it.amount / max) * 100)}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{money(it.amount, cur)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
