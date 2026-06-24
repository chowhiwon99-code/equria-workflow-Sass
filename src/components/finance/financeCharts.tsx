import { ArrowDown, ArrowUp } from "lucide-react"
import { type ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { BreakdownItem, TrendMonth } from "./financeAgg"

/** 요약 지표 카드(우상단 증감% 배지 슬롯). */
export function SummaryCard({
  label,
  value,
  className,
  trend,
}: {
  label: string
  value: string
  className?: string
  trend?: ReactNode
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {trend}
      </div>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums", className)}>{value}</p>
    </div>
  )
}

/** 전월대비 증감% — 같은 통화의 curr vs prev만 비교. invert=지출(증가=나쁨). */
export function TrendBadge({ curr, prev, invert }: { curr: number; prev: number; invert?: boolean }) {
  if (prev === 0) return <span className="text-xs text-muted-foreground">{curr === 0 ? "—" : "신규"}</span>
  const pct = ((curr - prev) / Math.abs(prev)) * 100
  if (Math.abs(pct) < 0.5) return <span className="text-xs text-muted-foreground tabular-nums">0%</span>
  const up = pct > 0
  const good = invert ? !up : up
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs tabular-nums", good ? "text-success" : "text-destructive")}>
      <Icon className="size-3" />
      {up ? "+" : ""}
      {pct.toFixed(0)}%
    </span>
  )
}

/** 6개월 매출·지출 그룹막대 — 인라인 SVG(라이브러리 없이), 단일 통화. */
export function TrendBars({ months, format }: { months: TrendMonth[]; format: (n: number) => string }) {
  const max = Math.max(...months.flatMap((m) => [m.revenue, m.expense]), 1)
  const W = 320
  const H = 116
  const pad = 16
  const labelH = 16
  const chartH = H - pad - labelH
  const n = Math.max(months.length, 1)
  const groupW = (W - pad * 2) / n
  const barW = Math.min(13, groupW / 3)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="월간 매출·지출 추세">
      {months.map((mo, i) => {
        const cx = pad + groupW * i + groupW / 2
        const rh = (mo.revenue / max) * chartH
        const eh = (mo.expense / max) * chartH
        return (
          <g key={`${mo.ym.y}-${mo.ym.m}`}>
            <rect x={cx - barW - 1} y={pad + chartH - rh} width={barW} height={rh} rx={1.5} className="fill-current text-success">
              <title>{`${mo.label} 매출 ${format(mo.revenue)}`}</title>
            </rect>
            <rect x={cx + 1} y={pad + chartH - eh} width={barW} height={eh} rx={1.5} className="fill-current text-destructive">
              <title>{`${mo.label} 지출 ${format(mo.expense)}`}</title>
            </rect>
            <text x={cx} y={H - 4} textAnchor="middle" className="fill-current text-[9px] text-muted-foreground">
              {mo.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** 분류 가로막대 — 순수 CSS(width%). KRW 기준 데이터만 받는다. */
export function BreakdownBars({ items, format }: { items: BreakdownItem[]; format: (n: number) => string }) {
  if (items.length === 0) return <p className="py-4 text-center text-xs text-muted-foreground">데이터 없음</p>
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 truncate text-muted-foreground" title={it.label}>
            {it.label}
          </span>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary/70" style={{ width: `${Math.max(2, it.pct)}%` }} />
          </div>
          <span className="w-24 shrink-0 truncate text-right font-medium tabular-nums">{format(it.amount)}</span>
          <span className="w-9 shrink-0 text-right text-muted-foreground tabular-nums">{it.pct.toFixed(0)}%</span>
        </div>
      ))}
    </div>
  )
}
