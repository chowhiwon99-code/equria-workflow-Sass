"use client"

import { Fragment, useMemo, useState } from "react"
import { Trash2, Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, SlidersHorizontal, ChevronDown, ChevronRight, PenLine } from "lucide-react"
import { CURRENCIES, EXPENSE_CATEGORIES, REVENUE_CATEGORIES, money } from "@/lib/finance"
import { SLOT_TYPES, ITEM_TYPES, slotLabel, slotColor, fieldsOf, astOf } from "@/lib/cashAccounts"
import { tagBg, swatch, CATEGORY_COLORS } from "@/lib/meetingMeta"
import { evalFormula, type CalcField } from "@/lib/calcFormula"
import type { CashAccount, CashCalcType, CashCategory } from "@/types"
import { slotCategory, type CashSummary } from "@/lib/cashflowGraph"

type SortKey = "name" | "kind" | "amount"

/**
 * 손익 계산기 표 — 세션41 심플 UX: 행 기본 = 한 줄 요약(이름·구분·계산 요약·금액),
 * 유형 선택·입력칸·분류·통화는 행을 펼쳤을 때만(편집 행). 데이터 모델·계산은 무변경(표현만).
 * 그룹(cash_categories)이 있으면 그룹별 섹션 + 소계. 입력 즉시 부모(SSOT)가 amount 재계산.
 */
export function CashGrid({
  slots,
  groups,
  pool,
  calcTypes,
  defaultType,
  onAddSlot,
  onUpdateSlot,
  onDeleteSlot,
  onEditColumns,
  onRecord,
}: {
  slots: CashAccount[]
  groups: CashCategory[]
  pool: CashSummary
  calcTypes: CashCalcType[]
  defaultType: CashCalcType | null
  onAddSlot: () => void
  onUpdateSlot: (id: string, patch: Partial<CashAccount>) => void
  onDeleteSlot: (slot: CashAccount) => void
  onEditColumns: () => void
  onRecord: (slot: CashAccount) => void
}) {
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "kind", dir: 1 })
  const [colorFor, setColorFor] = useState<string | null>(null)
  const [live, setLive] = useState<Record<string, Record<string, number>>>({}) // 타이핑 즉시 금액 미리보기(슬롯별 필드 override)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()) // 표에서 접은 그룹(로컬·뷰 전용, 소계는 계속 표시)
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

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

  const sections = useMemo(() => {
    const byG = new Map<string | null, CashAccount[]>()
    for (const s of rows) {
      const k = s.category_id ?? null
      const arr = byG.get(k) ?? []
      arr.push(s)
      byG.set(k, arr)
    }
    const secs = groups.map((g) => ({ group: g, items: byG.get(g.id) ?? [] })).filter((s) => s.items.length > 0)
    return { secs, ungrouped: byG.get(null) ?? [] }
  }, [rows, groups])

  const groupNet = (items: CashAccount[]) => items.reduce((a, s) => a + (slotCategory(s.kind) === "income" ? Number(s.amount) : -Number(s.amount)), 0)

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  const sortIcon = (k: SortKey) =>
    sort.key !== k ? <ArrowUpDown className="size-3 opacity-40" /> : sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />

  const th = "px-2 py-2 text-left font-medium whitespace-nowrap"
  const thR = "px-2 py-2 text-right font-medium whitespace-nowrap"

  // 펼친 편집 행(뷰 전용) — 기본은 요약 한 줄, 계산 칸을 누르면 입력칸이 열린다.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const NCOL = 5 // 항목명·구분·계산·이번 달 금액·액션 — 헤더 컬럼 수와 일치

  const renderRow = (s: CashAccount) => {
    const customType = s.calc_type_id ? calcTypes.find((t) => t.id === s.calc_type_id) : undefined
    const isDefault = !!defaultType && s.calc_type_id === defaultType.id
    const isOtherCustom = !!customType && !isDefault
    const { fields, getVal, setVal } = fieldsOf(s, calcTypes, onUpdateSlot)
    const calc = fields.length > 0
    const setLiveVal = (k: string, v: number) => setLive((p) => ({ ...p, [s.id]: { ...p[s.id], [k]: v } }))
    const ast = astOf(s, calcTypes)
    const shownAmount = calc && ast ? evalFormula(ast, { ...Object.fromEntries(fields.map((f) => [f.key, getVal(f.key)])), ...(live[s.id] ?? {}) }) : Number(s.amount)
    const editor = (f: CalcField) => (f.kind === "percent" ? <InlinePercent value={getVal(f.key)} onCommit={(v) => setVal(f.key, v)} onLive={(v) => setLiveVal(f.key, v)} /> : <InlineNumber width="w-20" value={getVal(f.key)} onCommit={(v) => setVal(f.key, v)} onLive={(v) => setLiveVal(f.key, v)} />)
    const isHold = slotCategory(s.kind) === "hold"
    const isLedger = s.item_type === "ledger"
    const open = expanded.has(s.id)
    const typeName = isLedger ? "장부 자동" : (customType?.name ?? ITEM_TYPES.find((t) => t.value === s.item_type)?.label ?? "직접 입력")
    // 요약 한 줄 — 입력칸을 늘어놓는 대신 유형·핵심 값만. 자세한 편집은 펼쳐서.
    const summary = isLedger
      ? `${typeName} · ${s.ledger_category || "전체"}`
      : calc && !isHold
        ? `${typeName} · 계산값 ${money(shownAmount, s.currency)}`
        : s.ledger_category
          ? `${typeName} · ${s.ledger_category}`
          : typeName
    return (
      <Fragment key={s.id}>
        <tr className="group hover:bg-muted/20">
          {/* min-w: 항목명 열이 자동 배분에서 쪼그라들어 이름이 잘리는 것 방지(입력칸이 w-full이라 고유폭 0) */}
          <td className="min-w-36 px-2 py-1.5">
            <div className="relative flex items-center gap-1.5">
              <button onClick={() => setColorFor(colorFor === s.id ? null : s.id)} className="size-3.5 shrink-0 rounded-full ring-1 ring-border transition-transform hover:scale-110" style={{ backgroundColor: swatch(s.color) }} title="색 변경" />
              {colorFor === s.id && (
                <div className="absolute left-0 top-6 z-20 flex gap-1 rounded-lg border bg-popover p-1.5 shadow-md">
                  {CATEGORY_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        onUpdateSlot(s.id, { color: c })
                        setColorFor(null)
                      }}
                      className="size-4 rounded-full ring-1 ring-border transition-transform hover:scale-110"
                      style={{ backgroundColor: swatch(c) }}
                      title={c}
                    />
                  ))}
                </div>
              )}
              <InlineText value={s.name} onCommit={(v) => onUpdateSlot(s.id, { name: v })} />
            </div>
          </td>
          <td className="px-2 py-1.5">
            {isOtherCustom ? (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: tagBg(s.color, 22) }}>{slotLabel(s.kind)}</span>
            ) : (
              <select value={s.kind} onChange={(e) => onUpdateSlot(s.id, { kind: e.target.value, color: slotColor(e.target.value) })} style={{ backgroundColor: tagBg(s.color, 22) }} className="cursor-pointer rounded-full border-0 px-2 py-0.5 text-xs font-medium outline-none focus:ring-1 focus:ring-ring">
                {SLOT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            )}
          </td>
          {/* 계산 요약 — 누르면 아래에 편집 행이 열린다 */}
          <td className="px-2 py-1.5">
            <button
              onClick={() => toggleExpand(s.id)}
              className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              title={open ? "접기" : "펼쳐서 편집"}
            >
              {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
              <span className="truncate tabular-nums">{summary}</span>
            </button>
          </td>
          <td className="px-2 py-1.5 text-right">
            {isLedger ? (
              <span className="px-1 font-medium tabular-nums" title="미연결 기록 잔여 합계 — 장부 자동">{money(Number(s.amount), s.currency)}</span>
            ) : isHold ? (
              /* 보유금 — 장부 개념 없음, 직접 입력/수식 유지 */
              calc ? <span className="px-1 font-medium tabular-nums">{money(shownAmount, s.currency)}</span> : <InlineNumber width="w-24" value={Number(s.amount)} onCommit={(v) => onUpdateSlot(s.id, { amount: v })} />
            ) : (
              /* 매출·비용 = 원장 파생(이번 달 자기 기록 합계) — 편집은 '기록'으로 */
              <span className="px-1 font-medium tabular-nums" title="이번 달 기록 합계 — 장부 기준(기록 버튼으로 추가)">{money(Number(s.amount), s.currency)}</span>
            )}
          </td>
          <td className="px-1 py-1.5">
            <div className="flex items-center justify-end gap-1.5">
              {/* 기록 — 매출·비용 슬롯의 장부 쓰기(항상 노출). 보유금·ledger 자동 슬롯 제외 */}
              {!isLedger && !isHold && (
                <button onClick={() => onRecord(s)} className="rounded p-0.5 text-muted-foreground transition hover:text-primary" title="장부에 기록">
                  <PenLine className="size-3.5" />
                </button>
              )}
              <button onClick={() => onDeleteSlot(s)} className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive" title="삭제">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </td>
        </tr>
        {/* 편집 행 — 유형·입력칸·분류·통화(요약을 눌렀을 때만) */}
        {open && (
          <tr className="bg-muted/10">
            <td colSpan={NCOL} className="px-3 pb-2.5 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {isLedger ? (
                  // 장부 연동 슬롯 — 어떤 분류를 합산할지 선택(전체/식비/…). 바꾸면 다음 로드에서 금액 동기화.
                  <label className="flex items-center gap-1.5">
                    분류
                    <select
                      value={s.ledger_category ?? ""}
                      onChange={(e) => onUpdateSlot(s.id, { ledger_category: e.target.value || null })}
                      className="cursor-pointer rounded border bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">전체</option>
                      {(slotCategory(s.kind) === "income" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      {s.ledger_category &&
                        !((slotCategory(s.kind) === "income" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES) as readonly string[]).includes(s.ledger_category) && (
                          <option value={s.ledger_category}>{s.ledger_category}</option>
                        )}
                    </select>
                  </label>
                ) : (
                  <>
                    <label className="flex items-center gap-1.5">
                      유형
                      <select
                        value={s.calc_type_id ? `c:${s.calc_type_id}` : s.item_type}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v.startsWith("c:")) onUpdateSlot(s.id, { calc_type_id: v.slice(2), item_type: "fixed" })
                          else onUpdateSlot(s.id, { item_type: v, calc_type_id: null })
                        }}
                        className="cursor-pointer rounded border bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                      >
                        <optgroup label="기본">
                          {ITEM_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </optgroup>
                        {calcTypes.length > 0 && (
                          <optgroup label="커스텀">
                            {calcTypes.map((t) => (
                              <option key={t.id} value={`c:${t.id}`}>{t.name}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </label>
                    {fields.map((f) => (
                      <label key={f.key} className="flex items-center gap-1">
                        {f.label}
                        {editor(f)}
                      </label>
                    ))}
                    {/* 계산값 = 기록 프리필용 도우미(진실 아님 — 진실은 금액 열의 이번 달 기록 합계) */}
                    {calc && !isHold && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums" title="수식 계산값 — '기록'을 누르면 이 값이 장부에 기록돼요">
                        계산값 {money(shownAmount, s.currency)}
                      </span>
                    )}
                    {!isHold && (
                      <label className="flex items-center gap-1">
                        분류
                        <CategoryInput slot={s} onUpdateSlot={onUpdateSlot} />
                      </label>
                    )}
                  </>
                )}
                <label className="flex items-center gap-1.5">
                  통화
                  <select value={s.currency} onChange={(e) => onUpdateSlot(s.id, { currency: e.target.value })} className="cursor-pointer rounded border bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring">
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                </label>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  return (
    <section className="flex flex-col gap-2.5 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">
          손익 항목 <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{slots.length}</span>
        </h3>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="항목 검색…" className="h-8 w-44 rounded-lg border bg-background pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
        </div>
        {/* 칸 편집은 폰에서 숨김(대표 확정 — 구조 편집은 PC에서) */}
        <button onClick={onEditColumns} className="hidden h-8 items-center gap-1 rounded-lg border px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted md:inline-flex" title="계산 칸·수식 편집(부가세 등 추가)">
          <SlidersHorizontal className="size-3.5" /> 칸 편집
        </button>
        {/* 항목 추가는 폰에서 숨김(대표 확정 — 구조 편집은 PC에서) */}
        <button onClick={onAddSlot} className="hidden h-8 items-center gap-1 rounded-lg bg-foreground px-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 md:inline-flex">
          <Plus className="size-3.5" /> 항목 추가
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
            <tr>
              <th className={th}><button onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">항목명 {sortIcon("name")}</button></th>
              <th className={th}><button onClick={() => toggleSort("kind")} className="inline-flex items-center gap-1 hover:text-foreground">구분 {sortIcon("kind")}</button></th>
              <th className={th} title="누르면 유형·입력칸·분류가 펼쳐져요">계산</th>
              <th className={thR}><button onClick={() => toggleSort("amount")} className="inline-flex items-center gap-1 hover:text-foreground" title="매출·비용 = 이번 달 장부 기록 합계(자동) · 보유금 = 직접 입력">이번 달 금액 {sortIcon("amount")}</button></th>
              <th className="w-14 px-1 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={NCOL} className="px-3 py-8 text-center text-sm text-muted-foreground">{q ? "검색 결과가 없어요." : "항목을 추가하고 유형·금액을 입력하면 자동으로 계산돼요."}</td>
              </tr>
            ) : (
              <>
                {sections.secs.map((sec) => {
                  const isCollapsed = collapsed.has(sec.group.id)
                  return (
                    <Fragment key={sec.group.id}>
                      <tr className="bg-muted/40">
                        <td colSpan={NCOL} className="px-2 py-1.5">
                          <div className="flex items-center gap-2 text-xs font-semibold">
                            <button onClick={() => toggleCollapse(sec.group.id)} className="flex items-center gap-2 hover:text-foreground" title={isCollapsed ? "펼치기" : "접기"}>
                              {isCollapsed ? <ChevronRight className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
                              <span className="size-2.5 rounded-full" style={{ backgroundColor: swatch(sec.group.color) }} />
                              {sec.group.name}
                              <span className="rounded-full bg-background/70 px-1.5 text-[10px] font-normal text-muted-foreground">{sec.items.length}</span>
                            </button>
                            <span className="ml-auto font-normal tabular-nums text-muted-foreground">
                              소계 <b className={groupNet(sec.items) < 0 ? "text-rose-600" : "text-emerald-600"}>{money(groupNet(sec.items), pool.currency)}</b>
                            </span>
                          </div>
                        </td>
                      </tr>
                      {!isCollapsed && sec.items.map(renderRow)}
                    </Fragment>
                  )
                })}
                {sections.ungrouped.length > 0 && sections.secs.length > 0 && (
                  <tr className="bg-muted/20">
                    <td colSpan={NCOL} className="px-2 py-1 text-xs text-muted-foreground">그룹 없음</td>
                  </tr>
                )}
                {sections.ungrouped.map(renderRow)}
              </>
            )}
          </tbody>
          {slots.length > 0 && (
            <tfoot className="border-t-2 bg-muted/30 text-xs">
              <tr>
                <td className="px-3 py-2 text-muted-foreground" colSpan={NCOL}>
                  <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 tabular-nums">
                    <span>총매출 <b className="text-emerald-600">{money(pool.revenue, pool.currency)}</b></span>
                    <span>총비용 <b className="text-rose-600">{money(pool.expense, pool.currency)}</b></span>
                    <span>순이익 <b className={pool.netProfit < 0 ? "text-rose-600" : "text-foreground"}>{money(pool.netProfit, pool.currency)}</b></span>
                    <span>가용현금 <b className={pool.available < 0 ? "text-rose-600" : "text-foreground"}>{money(pool.available, pool.currency)}</b></span>
                  </div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}

/** 슬롯 장부 분류 자유입력(+datalist 제안, CashFlowView가 렌더) — '기록' 시 이 분류로 내역에 찍힘. 비우면 슬롯명. */
function CategoryInput({ slot: s, onUpdateSlot }: { slot: CashAccount; onUpdateSlot: (id: string, patch: Partial<CashAccount>) => void }) {
  return (
    <input
      key={`${s.id}-${s.ledger_category ?? ""}`}
      defaultValue={s.ledger_category ?? ""}
      list={slotCategory(s.kind) === "income" ? "cf-cat-revenue" : "cf-cat-expense"}
      placeholder="기록 분류(비우면 슬롯명)"
      onBlur={(e) => {
        const v = e.target.value.trim()
        if (v !== (s.ledger_category ?? "")) onUpdateSlot(s.id, { ledger_category: v || null })
      }}
      className="w-36 rounded border bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
    />
  )
}

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
        if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur()
        if (e.key === "Escape") {
          e.currentTarget.value = value
          e.currentTarget.blur()
        }
      }}
      className="w-full rounded border-0 bg-transparent px-1 py-0.5 outline-none focus:bg-background focus:ring-1 focus:ring-ring"
    />
  )
}

function InlineNumber({ value, onCommit, onLive, width = "w-28" }: { value: number; onCommit: (v: number) => void; onLive?: (v: number) => void; width?: string }) {
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
      onChange={onLive ? (e) => { const num = Number(e.currentTarget.value.replace(/,/g, "")); if (!Number.isNaN(num)) onLive(num) } : undefined}
      onBlur={(e) => {
        const num = Number(e.target.value.replace(/,/g, ""))
        if (!Number.isNaN(num) && num !== value) onCommit(num)
        else e.currentTarget.value = fmt(value)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur()
      }}
      className={`${width} rounded border-0 bg-transparent px-1 py-0.5 text-right tabular-nums outline-none focus:bg-background focus:ring-1 focus:ring-ring`}
    />
  )
}

function InlinePercent({ value, onCommit, onLive }: { value: number; onCommit: (v: number) => void; onLive?: (v: number) => void }) {
  const fmt = (v: number) => (v ? String(+(v * 100).toFixed(2)) : "")
  return (
    <span className="inline-flex items-center">
      <input
        key={value}
        defaultValue={fmt(value)}
        inputMode="decimal"
        placeholder="0"
        onFocus={(e) => {
          e.currentTarget.value = value ? String(+(value * 100).toFixed(2)) : ""
          e.currentTarget.select()
        }}
        onChange={onLive ? (e) => { const num = Number(e.currentTarget.value.replace(/,/g, "")); if (!Number.isNaN(num)) onLive(num / 100) } : undefined}
        onBlur={(e) => {
          const num = Number(e.target.value.replace(/,/g, ""))
          if (!Number.isNaN(num)) onCommit(num / 100)
          else e.currentTarget.value = fmt(value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur()
        }}
        className="w-12 rounded border-0 bg-transparent px-1 py-0.5 text-right tabular-nums outline-none focus:bg-background focus:ring-1 focus:ring-ring"
      />
      <span className="text-xs text-muted-foreground">%</span>
    </span>
  )
}
