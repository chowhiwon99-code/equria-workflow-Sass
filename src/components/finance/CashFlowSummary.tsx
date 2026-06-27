"use client"

import { Trash2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { money } from "@/lib/finance"
import { tagBg } from "@/lib/meetingMeta"
import { slotCategory, type CashSummary } from "@/lib/cashflowGraph"
import type { CashAccount } from "@/types"

// 토스식 손익 요약 — 매출 → 회사 가용현금 → 비용 흐름(곡선 두께=금액) + 항목 박스를 그 자리에서 편집/삭제/추가.
export function CashFlowSummary({
  slots,
  pool,
  onUpdateSlot,
  onDeleteSlot,
  onAddSlot,
}: {
  slots: CashAccount[]
  pool: CashSummary
  onUpdateSlot: (id: string, patch: Partial<CashAccount>) => void
  onDeleteSlot: (slot: CashAccount) => void
  onAddSlot: (kind: string, color: string) => void
}) {
  const cur = pool.currency
  const bucket = (flow: "income" | "expense") => slots.filter((s) => slotCategory(s.kind) === flow).sort((a, b) => Number(b.amount) - Number(a.amount))
  const revItems = bucket("income")
  const expItems = bucket("expense")

  const maxFlow = Math.max(pool.revenue, pool.expense, 1)
  const w = (a: number) => 3 + 22 * Math.sqrt(Math.min(1, a / maxFlow))
  const negAvail = pool.available < 0
  const negProfit = pool.netProfit < 0

  return (
    <div className="flex flex-col gap-4">
      {/* 흐름 밴드: 매출 → 회사 가용현금 → 비용 (요약·읽기) */}
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
          <SideCard className="left-2" tone="emerald" label="매출" value={money(pool.revenue, cur)} />
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
          <SideCard className="right-2" tone="rose" label="비용" value={money(pool.expense, cur)} />
        </div>
      </div>

      {/* 항목 박스 — 그 자리에서 편집/삭제/추가 */}
      <div className="grid gap-3 md:grid-cols-2">
        <EditBucket title="매출" tone="emerald" total={money(pool.revenue, cur)} items={revItems} cur={cur} onUpdateSlot={onUpdateSlot} onDeleteSlot={onDeleteSlot} onAdd={() => onAddSlot("revenue_src", "green")} />
        <EditBucket title="비용" tone="rose" total={money(pool.expense, cur)} items={expItems} cur={cur} onUpdateSlot={onUpdateSlot} onDeleteSlot={onDeleteSlot} onAdd={() => onAddSlot("expense_dst", "red")} />
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

function EditBucket({
  title,
  tone,
  total,
  items,
  cur,
  onUpdateSlot,
  onDeleteSlot,
  onAdd,
}: {
  title: string
  tone: "emerald" | "rose"
  total: string
  items: CashAccount[]
  cur: string
  onUpdateSlot: (id: string, patch: Partial<CashAccount>) => void
  onDeleteSlot: (slot: CashAccount) => void
  onAdd: () => void
}) {
  const max = Math.max(1, ...items.map((i) => Number(i.amount)))
  return (
    <section className="flex flex-col gap-2 rounded-2xl border bg-card p-3.5">
      <div className="flex items-baseline justify-between">
        <h4 className={cn("text-sm font-semibold", tone === "emerald" ? "text-emerald-600" : "text-rose-600")}>{title}</h4>
        <span className="text-sm font-semibold tabular-nums">{total}</span>
      </div>
      <div className="flex flex-col gap-1">
        {items.map((s) => {
          const editable = s.item_type === "fixed" && !s.calc_type_id
          return (
            <div key={s.id} className="group flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-muted/40">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tagBg(s.color, 90) }} />
              <div className="w-24 shrink-0">
                <InlineText value={s.name} onCommit={(v) => onUpdateSlot(s.id, { name: v })} />
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", tone === "emerald" ? "bg-emerald-500/70" : "bg-rose-500/70")} style={{ width: `${Math.max(3, (Number(s.amount) / max) * 100)}%` }} />
              </div>
              <div className="w-24 shrink-0 text-right">
                {editable ? (
                  <InlineNumber value={Number(s.amount)} onCommit={(v) => onUpdateSlot(s.id, { amount: v })} />
                ) : (
                  <span className="px-1 text-xs tabular-nums text-muted-foreground" title="계산형 — 표에서 값 편집">{money(Number(s.amount), cur)}</span>
                )}
              </div>
              <button onClick={() => onDeleteSlot(s)} className="shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive" title="삭제">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )
        })}
        <button onClick={onAdd} className="mt-0.5 inline-flex items-center gap-1 self-start rounded-lg border border-dashed px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Plus className="size-3" /> 항목 추가
        </button>
      </div>
    </section>
  )
}

// 비제어 인라인 셀 — value 변경(재로드) 시 key로 리마운트.
function InlineText({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  return (
    <input
      key={value}
      defaultValue={value}
      placeholder="이름"
      onBlur={(e) => {
        const v = e.target.value.trim()
        if (v && v !== value) onCommit(v)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          e.currentTarget.value = value
          e.currentTarget.blur()
        }
      }}
      className="w-full truncate rounded border-0 bg-transparent px-1 py-0.5 text-xs outline-none focus:bg-background focus:ring-1 focus:ring-ring"
    />
  )
}

function InlineNumber({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const fmt = (v: number) => (v ? v.toLocaleString() : "")
  return (
    <input
      key={value}
      defaultValue={fmt(value)}
      inputMode="decimal"
      placeholder="0"
      onFocus={(e) => {
        e.currentTarget.value = value ? String(value) : ""
        e.currentTarget.select()
      }}
      onBlur={(e) => {
        const num = Number(e.target.value.replace(/,/g, ""))
        if (!Number.isNaN(num) && num !== value) onCommit(num)
        else e.currentTarget.value = fmt(value)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
      }}
      className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-right text-xs tabular-nums outline-none focus:bg-background focus:ring-1 focus:ring-ring"
    />
  )
}
