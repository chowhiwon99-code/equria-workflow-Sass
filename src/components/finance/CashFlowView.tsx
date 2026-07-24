"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Download, FileDown, Settings, X, Sheet, Calculator, Sparkles, Link2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { useUndo } from "@/components/undo/UndoProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { Loading, ErrorState } from "@/components/shared/States"
import { Button } from "@/components/ui/button"
import { downloadCsv, todayStamp } from "@/lib/csv"
import { downloadPnlXlsx } from "@/lib/xlsx"
import { money, CURRENCIES, computeSlotAmount } from "@/lib/finance"
import { slotLabel, CASHFLOW_TEMPLATES, ITEM_TYPES } from "@/lib/cashAccounts"
import { evalFormula, flowToKind, BUILTIN_FIELDS, QTY_AST, CHANNEL_AST, type CalcNode, type CalcField } from "@/lib/calcFormula"
import { cn } from "@/lib/utils"
import type { CashAccount, CashCalcType, CashCategory } from "@/types"
import { buildSlotGraph } from "@/lib/cashflowGraph"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { CashGrid } from "./CashGrid"
import { CashFlowCanvas } from "./CashFlowCanvas"
import { CalcTypeBuilder } from "./CalcTypeBuilder"
import { CashCoachPanel } from "./CashCoachPanel"

const WORKSPACE_ID = "00000000-0000-0000-0000-0000000000e1"

/** 이번 달 [시작, 다음달 시작) — 장부(finance_entries) 합계 동기화 범위. */
function currentMonthRange(): { start: string; end: string } {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  return { start: `${y}-${p(m)}-01`, end: m === 12 ? `${y + 1}-01-01` : `${y}-${p(m + 1)}-01` }
}

/** 통화별 장부 합계(이번 달·휴지통 제외). ledger 슬롯 amount의 원천. */
type LedgerTotals = Record<string, { revenue: number; expense: number }>
function ledgerAmountFor(slot: { kind: string; currency: string }, totals: LedgerTotals): number {
  const t = totals[slot.currency || "KRW"]
  if (!t) return 0
  return slot.kind === "revenue_src" ? t.revenue : slot.kind === "expense_dst" ? t.expense : 0
}
const DEFAULT_TYPE_NAME = "기본 계산" // 회사가 편집하는 표 계산 칸의 출처(시드 1회)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"))
const PRINT_CSS = `body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#111;margin:24px;-webkit-print-color-adjust:exact}h1{font-size:18px;margin:0}h2{font-size:14px;margin:18px 0 4px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:4px 8px;text-align:left}th{background:#f5f5f5}.r{text-align:right;font-variant-numeric:tabular-nums}@media print{@page{margin:14mm}}`

/**
 * 현금흐름 지도 — SSOT 부모. 슬롯(돈 항목)을 한 번 로드, 흐름도+그리드가 같은 데이터.
 * 그리드에서 금액을 타이핑하면 update→load→흐름도 즉시 반영.
 */
export function CashFlowView() {
  const supabase = createClient()
  const me = useCurrentUserId()
  const { push } = useUndo()
  const isDesktop = useMediaQuery("(min-width: 768px)") // 캔버스는 md+에서만 마운트
  const [slots, setSlots] = useState<CashAccount[]>([])
  const [calcTypes, setCalcTypes] = useState<CashCalcType[]>([])
  const [groups, setGroups] = useState<CashCategory[]>([])
  const [opening, setOpening] = useState<Record<string, number>>({})
  const [defaultCurrency, setDefaultCurrency] = useState("KRW")
  const [showSettings, setShowSettings] = useState(false)
  const [showCoach, setShowCoach] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editType, setEditType] = useState<CashCalcType | null>(null)
  const [poolPos, setPoolPos] = useState<{ x: number; y: number } | null>(null)
  const [defaultCalcTypeId, setDefaultCalcTypeId] = useState<string | null>(null)
  const [ledgerTotals, setLedgerTotals] = useState<LedgerTotals>({}) // 이번 달 장부 합계(연동 슬롯 생성·동기화용)
  const seededRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const mr = currentMonthRange()
      const [{ data: slotData, error: e }, { data: settings }, { data: types }, { data: grps }, { data: ledgerRows }] = await Promise.all([
        supabase.from("cash_accounts").select("*").is("deleted_at", null).order("sort_order"),
        supabase.from("cashflow_settings").select("opening_cash, default_currency, pool_pos, default_calc_type_id").maybeSingle(),
        supabase.from("cash_calc_types").select("*").order("sort_order"),
        supabase.from("cash_categories").select("*").order("sort_order"),
        // 장부(내역) 이번 달 합계 — ledger 슬롯 amount의 원천(요약 탭과 같은 데이터)
        supabase.from("finance_entries").select("kind, total_amount, currency").is("deleted_at", null).gte("entry_date", mr.start).lt("entry_date", mr.end),
      ])
      if (e) throw e

      // 장부 합계 집계(통화별) + ledger 슬롯 동기화 — 열 때마다 최신 장부가 계산기에 반영(요약↔현금흐름 일치)
      const totals: LedgerTotals = {}
      for (const r of ledgerRows ?? []) {
        const t = (totals[r.currency || "KRW"] ??= { revenue: 0, expense: 0 })
        if (r.kind === "revenue") t.revenue += Number(r.total_amount)
        else t.expense += Number(r.total_amount)
      }
      setLedgerTotals(totals)
      let slotList = (slotData as CashAccount[]) ?? []
      const stale = slotList.filter((s) => s.item_type === "ledger" && Number(s.amount) !== ledgerAmountFor(s, totals))
      if (stale.length > 0) {
        await Promise.all(stale.map((s) => supabase.from("cash_accounts").update({ amount: ledgerAmountFor(s, totals) }).eq("id", s.id)))
        slotList = slotList.map((s) => (s.item_type === "ledger" ? { ...s, amount: ledgerAmountFor(s, totals) } : s))
      }
      let typeList = (types as CashCalcType[]) ?? []
      let defId = (settings?.default_calc_type_id as string | null) ?? null
      // 회사 "기본 계산 유형" 1회 멱등 시드 — 표 계산 칸(필드)의 출처. 회사가 이 유형을 편집해 칸을 바꿈.
      if (!defId && me && !seededRef.current) {
        seededRef.current = true
        const existing = typeList.find((t) => t.name === DEFAULT_TYPE_NAME)
        if (existing) defId = existing.id
        else {
          const { data: created } = await supabase
            .from("cash_calc_types")
            .insert({ workspace_id: WORKSPACE_ID, name: DEFAULT_TYPE_NAME, flow: "revenue", fields: BUILTIN_FIELDS.channel, formula: { ast: CHANNEL_AST }, created_by: me, sort_order: -1 })
            .select()
            .single()
          if (created) {
            typeList = [created as CashCalcType, ...typeList]
            defId = created.id
          }
        }
        if (defId) await supabase.from("cashflow_settings").upsert({ workspace_id: WORKSPACE_ID, default_calc_type_id: defId, updated_by: me, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" })
      }
      setSlots(slotList)
      setGroups((grps as CashCategory[]) ?? [])
      setCalcTypes(typeList)
      setOpening((settings?.opening_cash as Record<string, number>) ?? {})
      setDefaultCurrency(settings?.default_currency ?? "KRW")
      setPoolPos((settings?.pool_pos as { x: number; y: number } | null) ?? null)
      setDefaultCalcTypeId(defId)
      setError(null)
    } catch {
      setError("현금흐름을 불러오지 못했어요.")
    } finally {
      setLoading(false)
    }
  }, [supabase, me])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // 되돌리기/다시실행 반영
  useEffect(() => {
    const h = () => load()
    window.addEventListener("equria:reload", h)
    return () => window.removeEventListener("equria:reload", h)
  }, [load])

  const graph = useMemo(() => buildSlotGraph(slots, opening, defaultCurrency, poolPos), [slots, opening, defaultCurrency, poolPos])
  const currencies = useMemo(() => Array.from(new Set([defaultCurrency, ...slots.map((s) => s.currency)])), [defaultCurrency, slots])
  const defaultType = useMemo(() => calcTypes.find((t) => t.id === defaultCalcTypeId) ?? null, [calcTypes, defaultCalcTypeId])

  // ── 설정(보유현금·기본통화) — 입력 즉시 흐름도 반영 + 저장(upsert) ──
  const saveSettings = async (nextOpening: Record<string, number>, nextCurrency: string, nextPool: { x: number; y: number } | null = poolPos) => {
    await mustOk(
      supabase
        .from("cashflow_settings")
        .upsert({ workspace_id: WORKSPACE_ID, opening_cash: nextOpening, default_currency: nextCurrency, pool_pos: nextPool, updated_by: me, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" })
    )
  }
  // 캔버스 이동 — 슬롯은 x/y 직접 저장(재계산·reload 없음), pool은 설정에 낙관적 저장.
  const moveAccount = async (id: string, x: number, y: number) => {
    await mustOk(supabase.from("cash_accounts").update({ x, y }).eq("id", id))
  }
  const movePool = (x: number, y: number) => {
    setPoolPos({ x, y })
    saveSettings(opening, defaultCurrency, { x, y })
  }
  const setOpeningFor = (currency: string, value: number) => {
    const next = { ...opening, [currency]: value }
    setOpening(next)
    saveSettings(next, defaultCurrency)
  }
  const setDefaultCur = (currency: string) => {
    setDefaultCurrency(currency)
    saveSettings(opening, currency)
  }

  // ── 슬롯 CRUD ──
  const addSlot = async (kind = "expense_dst", color = "red") => {
    if (!me) return
    // 새 항목 기본 = "개수 × 단가"(빌트인 qty). 사용자가 유형에서 직접 입력/채널 판매로 바꿀 수 있음.
    const { error: e } = await supabase
      .from("cash_accounts")
      .insert({ name: "새 항목", kind, color, item_type: "qty", calc_type_id: null, created_by: me, sort_order: slots.length })
    if (e) return toast.error("항목을 추가하지 못했어요.")
    load()
  }
  // 장부 연동 — "요약(실제 장부)과 계산기가 안 맞는" 문제의 정면 해결. 이번 달 내역 합계가
  // 자동 반영되는 슬롯 2개(매출·비용)를 만든다. 이후 amount는 load()가 항상 최신 장부로 동기화.
  const linkLedger = async () => {
    if (!me) return
    const existing = new Set(slots.filter((s) => s.item_type === "ledger").map((s) => s.kind))
    const wanted = [
      { kind: "revenue_src", color: "green", name: "장부 매출(이번 달)" },
      { kind: "expense_dst", color: "red", name: "장부 비용(이번 달)" },
    ].filter((w) => !existing.has(w.kind))
    if (wanted.length === 0) return toast.info("이미 장부와 연동돼 있어요.")
    const rows = wanted.map((w, i) => ({
      name: w.name, kind: w.kind, color: w.color, item_type: "ledger", calc_type_id: null,
      amount: ledgerAmountFor({ kind: w.kind, currency: defaultCurrency }, ledgerTotals),
      currency: defaultCurrency, created_by: me, sort_order: slots.length + i,
    }))
    const { error: e } = await supabase.from("cash_accounts").insert(rows)
    if (e) return toast.error("장부 연동에 실패했어요.")
    toast.success("장부와 연동됐어요 — 내역이 바뀌면 자동 반영돼요.")
    load()
  }
  const updateSlot = async (id: string, patch: Partial<CashAccount>) => {
    // 어떤 입력칸을 고쳐도 amount 자동 재계산: 커스텀 유형이면 AST 평가, 아니면 빌트인.
    const cur = slots.find((s) => s.id === id)
    const merged = { ...cur, ...patch } as CashAccount
    const derived: Partial<CashAccount> = {}
    let amount: number
    if (merged.calc_type_id) {
      const ct = calcTypes.find((t) => t.id === merged.calc_type_id)
      const ast = (ct?.formula as { ast?: CalcNode } | null)?.ast ?? null
      amount = evalFormula(ast, (merged.field_values as Record<string, number>) ?? {})
      // 회사 기본 계산 유형은 구분을 강제하지 않음(매출·비용 모두 같은 칸 사용). 그 외 명명 유형만 flow→구분.
      if (ct && ct.id !== defaultCalcTypeId) derived.kind = flowToKind(ct.flow)
    } else {
      amount = computeSlotAmount(merged)
    }
    await mustOk(supabase.from("cash_accounts").update({ ...patch, ...derived, amount, updated_at: new Date().toISOString() }).eq("id", id))
    load()
  }
  const deleteSlot = async (slot: CashAccount) => {
    await supabase.from("cash_accounts").update({ deleted_at: new Date().toISOString() }).eq("id", slot.id)
    push({
      label: `"${slot.name}" 항목을 삭제했어요.`,
      undo: async () => {
        await supabase.from("cash_accounts").update({ deleted_at: null }).eq("id", slot.id)
      },
      redo: async () => {
        await supabase.from("cash_accounts").update({ deleted_at: new Date().toISOString() }).eq("id", slot.id)
      },
    })
    load()
  }

  // ── 그룹(cash_categories 재활용) — 조직화 레이어, 순이익 계산엔 무관 ──
  const addGroup = async () => {
    if (!me) return
    const { error: e } = await supabase.from("cash_categories").insert({ name: "새 그룹", color: "gray", created_by: me, sort_order: groups.length, x: 80, y: 80 })
    if (e) return toast.error("그룹을 추가하지 못했어요.")
    load()
  }
  const moveGroup = async (id: string, x: number, y: number) => {
    await mustOk(supabase.from("cash_categories").update({ x, y }).eq("id", id))
  }
  const updateGroup = async (id: string, patch: Partial<CashCategory>) => {
    await mustOk(supabase.from("cash_categories").update(patch).eq("id", id))
    load()
  }
  const deleteGroup = async (id: string) => {
    await supabase.from("cash_accounts").update({ category_id: null }).eq("category_id", id) // 소속 해제
    await supabase.from("cash_categories").delete().eq("id", id)
    load()
  }

  // 회사 기본 계산 유형(표 칸) 편집 — 필드/수식 변경 후 그 유형을 쓰는 행들 금액 재계산.
  const onUpdateCalcType = async (id: string, patch: Partial<CashCalcType>) => {
    await mustOk(supabase.from("cash_calc_types").update(patch).eq("id", id))
    const ct = { ...calcTypes.find((t) => t.id === id), ...patch } as CashCalcType
    const ast = (ct.formula as { ast?: CalcNode } | null)?.ast ?? null
    const affected = slots.filter((s) => s.calc_type_id === id)
    await Promise.all(affected.map((s) => supabase.from("cash_accounts").update({ amount: evalFormula(ast, (s.field_values as Record<string, number>) ?? {}) }).eq("id", s.id)))
    load()
  }
  const editColumns = () => {
    if (defaultType) setEditType(defaultType)
    setShowBuilder(true)
  }

  // ── 업종 템플릿(빈 상태 진입) ──
  const seedTemplate = async (tid: string) => {
    if (!me) return
    const tpl = CASHFLOW_TEMPLATES.find((t) => t.id === tid)
    if (!tpl) return
    const rows = tpl.slots.map((s, i) => ({ name: s.name, kind: s.kind, color: s.color, amount: s.amount ?? 0, currency: defaultCurrency, created_by: me, sort_order: i }))
    const { error: e } = await supabase.from("cash_accounts").insert(rows)
    if (e) return toast.error("템플릿을 불러오지 못했어요.")
    toast.success(`${tpl.label} 템플릿을 불러왔어요.`)
    load()
  }

  // ── Export ──
  const gname = (id: string | null) => (id ? groups.find((g) => g.id === id)?.name ?? null : null)
  const exportCsv = () => {
    const headers = ["그룹", "항목", "구분", "금액", "통화"]
    const rows = slots.map((s) => [gname(s.category_id) ?? "", s.name, slotLabel(s.kind), Number(s.amount), s.currency])
    downloadCsv(`현금흐름_${todayStamp()}.csv`, headers, rows)
  }
  // 함수가 살아있는 엑셀 — 열어서 숫자 바꾸면 자동 재계산. 그룹 순서대로 정렬해 섹션·소계 생성.
  const exportXlsx = async () => {
    const ordered = [...groups.flatMap((g) => slots.filter((s) => s.category_id === g.id)), ...slots.filter((s) => !s.category_id)]
    const rows = ordered.map((s) => {
      const ct = s.calc_type_id ? calcTypes.find((t) => t.id === s.calc_type_id) : undefined
      let fields: CalcField[] = []
      let values: Record<string, number> = {}
      let ast: CalcNode | null = null
      if (ct) {
        fields = (ct.fields as unknown as CalcField[]) ?? []
        values = (s.field_values as Record<string, number>) ?? {}
        ast = (ct.formula as { ast?: CalcNode } | null)?.ast ?? null
      } else if (s.item_type === "channel") {
        fields = BUILTIN_FIELDS.channel
        ast = CHANNEL_AST
        values = { units: Number(s.units), unit_price: Number(s.unit_price), rate: Number(s.rate), extra: Number(s.extra) }
      } else if (s.item_type === "qty") {
        fields = BUILTIN_FIELDS.qty
        ast = QTY_AST
        values = { units: Number(s.units), unit_price: Number(s.unit_price), extra: Number(s.extra) }
      }
      return {
        name: s.name,
        group: gname(s.category_id),
        kindLabel: slotLabel(s.kind),
        typeLabel: ct ? ct.name : ITEM_TYPES.find((t) => t.value === s.item_type)?.label ?? "정액",
        fields,
        values,
        ast,
        amount: Number(s.amount),
        currency: s.currency,
      }
    })
    try {
      await downloadPnlXlsx(`손익_${todayStamp()}.xlsx`, rows, graph.summary)
    } catch {
      toast.error("엑셀 생성에 실패했어요.")
    }
  }
  const exportPdf = () => {
    const win = window.open("", "_blank", "width=900,height=1000")
    if (!win) {
      toast.error("팝업이 차단됐어요. 허용 후 다시 시도해 주세요.")
      return
    }
    const slotRows = slots
      .map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(slotLabel(s.kind))}</td><td class="r">${esc(money(Number(s.amount), s.currency))}</td></tr>`)
      .join("")
    const netRows = graph.summary
      .map(
        (s) =>
          `<tr><td><b>가용현금 (${s.currency})</b></td><td></td><td class="r"><b>${esc(money(s.available, s.currency))}</b></td></tr>` +
          `<tr><td>순이익 (${s.currency})</td><td></td><td class="r">${esc(money(s.netProfit, s.currency))}</td></tr>`
      )
      .join("")
    win.document.write(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>현금흐름</title><style>${PRINT_CSS}</style></head><body>` +
        `<h1>현금흐름 지도</h1><h2>항목</h2>` +
        `<table><thead><tr><th>항목</th><th>구분</th><th class="r">금액</th></tr></thead><tbody>${slotRows}${netRows}</tbody></table>` +
        `<scr` +
        `ipt>window.onload=function(){setTimeout(function(){window.print()},300)}</scr` +
        `ipt></body></html>`
    )
    win.document.close()
  }

  if (loading) return <Loading rows={6} />
  if (error) return <ErrorState message={error} onRetry={() => { setError(null); load() }} />

  return (
    <div className="flex flex-col gap-4">
      {slots.length === 0 && (
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="text-sm font-medium">업종 템플릿으로 빠르게 시작</p>
          <p className="mt-0.5 text-xs text-muted-foreground">대표적인 매출·비용 항목을 미리 채워드려요. 이후 자유롭게 편집·추가·삭제하세요.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {CASHFLOW_TEMPLATES.map((t) => (
              <Button key={t.id} size="sm" variant="outline" onClick={() => seedTemplate(t.id)}>
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* 흐름도 */}
      <div className="flex flex-col gap-2 rounded-xl border bg-card/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">손익 요약</h3>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", graph.pool.available < 0 ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600")}>
              가용현금 {money(graph.pool.available, graph.pool.currency)}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", graph.pool.netProfit < 0 ? "bg-rose-500/10 text-rose-600" : "bg-blue-500/10 text-blue-600")}>
              순이익 {money(graph.pool.netProfit, graph.pool.currency)}
            </span>
          </div>
          {/* 모바일: 줄바꿈 허용(버튼 줄 화면 밖 삐짐 방지) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant={showCoach ? "default" : "outline"} onClick={() => setShowCoach((v) => !v)} disabled={slots.length === 0}>
              <Sparkles className="size-3.5" /> AI 코칭
            </Button>
            {/* 요약·내역(실제 장부)과 계산기를 잇는 자동 슬롯 — 이미 연동돼 있으면 숨김 */}
            {!slots.some((s) => s.item_type === "ledger") && (
              <Button size="sm" variant="outline" onClick={linkLedger}>
                <Link2 className="size-3.5" /> 장부 연동
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowBuilder(true)}>
              <Calculator className="size-3.5" /> 계산 유형
            </Button>
            <Button size="sm" variant={showSettings ? "default" : "outline"} onClick={() => setShowSettings((v) => !v)}>
              <Settings className="size-3.5" /> 설정
            </Button>
            {/* 내보내기(엑셀·CSV·PDF)는 폰에서 숨김(대표 확정 — 모바일은 조회 위주) */}
            <Button size="sm" variant="outline" onClick={exportXlsx} disabled={slots.length === 0} className="hidden md:inline-flex">
              <Sheet className="size-3.5" /> 엑셀
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={slots.length === 0} className="hidden md:inline-flex">
              <Download className="size-3.5" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportPdf} disabled={slots.length === 0} className="hidden md:inline-flex">
              <FileDown className="size-3.5" /> PDF
            </Button>
          </div>
        </div>
        {showSettings && (
          <div className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">현금흐름 설정</span>
              <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                기본 통화
                <select
                  value={defaultCurrency}
                  onChange={(e) => setDefaultCur(e.target.value)}
                  className="h-8 rounded-lg border bg-background px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </label>
              {currencies.map((cur) => (
                <label key={cur} className="flex flex-col gap-1 text-xs text-muted-foreground">
                  시작 보유현금 ({cur})
                  <input
                    key={`${cur}:${opening[cur] ?? 0}`}
                    defaultValue={opening[cur] ? opening[cur].toLocaleString() : ""}
                    inputMode="decimal"
                    placeholder="0"
                    onFocus={(e) => {
                      e.currentTarget.value = opening[cur] ? String(opening[cur]) : ""
                      e.currentTarget.select()
                    }}
                    onBlur={(e) => setOpeningFor(cur, Number(e.target.value.replace(/,/g, "")) || 0)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur()
                    }}
                    className="h-8 w-32 rounded-lg border bg-background px-2 text-right text-sm tabular-nums text-foreground outline-none focus:ring-1 focus:ring-ring"
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">시작 보유현금에 매출을 더하고 비용·보유를 빼서 가용현금·순이익을 계산해요. 입력하면 흐름도에 바로 반영됩니다.</p>
          </div>
        )}
        {showCoach && slots.length > 0 && (
          <CashCoachPanel slots={slots} summaries={graph.summary} groups={groups} defaultCurrency={defaultCurrency} onClose={() => setShowCoach(false)} />
        )}
        {/* 폰(<md)에선 캔버스 미마운트 — 마우스 전제 UI인데 숨김(display:none)만 하면 보이지 않는
            노드 트리가 slots 변경마다 재렌더돼 저사양 폰에서 낭비(적대 리뷰 확정 건) */}
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground md:hidden">
          흐름도(캔버스)는 PC에서 볼 수 있어요. 폰에서는 아래 표로 입력·확인하세요.
        </p>
        {isDesktop && (
          <CashFlowCanvas
            slots={slots}
            groups={groups}
            pool={graph.pool}
            poolPos={poolPos}
            calcTypes={calcTypes}
            defaultCalcTypeId={defaultCalcTypeId}
            onUpdateSlot={updateSlot}
            onDeleteSlot={deleteSlot}
            onAddSlot={addSlot}
            onAddGroup={addGroup}
            onMoveGroup={moveGroup}
            onUpdateGroup={updateGroup}
            onDeleteGroup={deleteGroup}
            onMoveAccount={moveAccount}
            onMovePool={movePool}
            onSetOpening={setOpeningFor}
          />
        )}
      </div>

      {/* 슬롯 표 — 금액 직접 입력 */}
      <CashGrid slots={slots} groups={groups} pool={graph.pool} calcTypes={calcTypes} defaultType={defaultType} onAddSlot={addSlot} onUpdateSlot={updateSlot} onDeleteSlot={deleteSlot} onUpdateCalcType={onUpdateCalcType} onEditColumns={editColumns} />

      {showBuilder && <CalcTypeBuilder types={calcTypes} editType={editType} onClose={() => { setShowBuilder(false); setEditType(null) }} onSaved={load} />}
    </div>
  )
}
