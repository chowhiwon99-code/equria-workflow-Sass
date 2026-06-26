"use client"

import { useMemo, useState } from "react"
import { Trash2, Plus, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { CURRENCIES } from "@/lib/finance"
import { SLOT_TYPES, slotColor } from "@/lib/cashAccounts"
import { tagBg } from "@/lib/meetingMeta"
import type { CashAccount } from "@/types"

type SortKey = "name" | "kind" | "amount"

/** 슬롯 테이블(LoadSwift st) — 돈 항목을 행으로, 금액을 셀에 직접 타이핑. 입력 즉시 흐름도 반영(부모 SSOT). */
export function CashGrid({
  slots,
  onAddSlot,
  onUpdateSlot,
  onDeleteSlot,
}: {
  slots: CashAccount[]
  onAddSlot: () => void
  onUpdateSlot: (id: string, patch: Partial<CashAccount>) => void
  onDeleteSlot: (slot: CashAccount) => void
}) {
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "kind", dir: 1 })

  const rows = useMemo(() => {
    const order: Record<string, number> = { revenue_src: 0, reserve: 1, expense_dst: 2 }
    const needle = q.trim().toLowerCase()
    const filtered = needle ? slots.filter((s) => s.name.toLowerCase().includes(needle)) : slots
    return [...filtered].sort((a, b) => {
      let d = 0
      if (sort.key === "name") d = a.name.localeCompare(b.name)
      else if (sort.key === "amount") d = Number(a.amount) - Number(b.amount)
      else d = (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || a.name.localeCompare(b.name)
      return d * sort.dir
    })
  }, [slots, q, sort])

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  const sortIcon = (k: SortKey) =>
    sort.key !== k ? <ArrowUpDown className="size-3 opacity-40" /> : sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />

  return (
    <section className="flex flex-col gap-2.5 rounded-xl border bg-card p-3">
      {/* 헤더: 제목·검색·추가 */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">
          현금 슬롯 <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{slots.length}</span>
        </h3>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="항목 검색…"
            className="h-8 w-44 rounded-lg border bg-background pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button
          onClick={onAddSlot}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-foreground px-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          <Plus className="size-3.5" /> 항목 추가
        </button>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">항목명 {sortIcon("name")}</button>
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => toggleSort("kind")} className="inline-flex items-center gap-1 hover:text-foreground">구분 {sortIcon("kind")}</button>
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <button onClick={() => toggleSort("amount")} className="inline-flex items-center gap-1 hover:text-foreground">금액 {sortIcon("amount")}</button>
              </th>
              <th className="px-3 py-2 text-left font-medium">통화</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {q ? "검색 결과가 없어요." : "항목을 추가하고 금액을 입력하면 흐름도에 바로 나타나요."}
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="group hover:bg-muted/20">
                  <td className="px-3 py-1">
                    <InlineText value={s.name} onCommit={(v) => onUpdateSlot(s.id, { name: v })} />
                  </td>
                  <td className="px-3 py-1">
                    <select
                      value={s.kind}
                      onChange={(e) => onUpdateSlot(s.id, { kind: e.target.value, color: slotColor(e.target.value) })}
                      style={{ backgroundColor: tagBg(slotColor(s.kind), 22) }}
                      className="cursor-pointer rounded-full border-0 px-2 py-0.5 text-xs font-medium outline-none focus:ring-1 focus:ring-ring"
                    >
                      {SLOT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1 text-right">
                    <InlineNumber value={Number(s.amount)} onCommit={(v) => onUpdateSlot(s.id, { amount: v })} />
                  </td>
                  <td className="px-3 py-1">
                    <select
                      value={s.currency}
                      onChange={(e) => onUpdateSlot(s.id, { currency: e.target.value })}
                      className="rounded border-0 bg-transparent text-xs outline-none focus:ring-1 focus:ring-ring"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.code}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button onClick={() => onDeleteSlot(s)} className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive" title="삭제">
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// 비제어 인라인 셀 — value 변경(재로드) 시 key로 리마운트, blur/Enter 시 커밋.
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
      className="w-full rounded border-0 bg-transparent px-1 py-0.5 outline-none focus:bg-background focus:ring-1 focus:ring-ring"
    />
  )
}

// 금액 셀 — 평소엔 천단위 콤마 표시, 포커스 시 원숫자로 편집.
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
      className="w-28 rounded border-0 bg-transparent px-1 py-0.5 text-right tabular-nums outline-none focus:bg-background focus:ring-1 focus:ring-ring"
    />
  )
}
