"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Download, FileDown, Settings, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { useUndo } from "@/components/undo/UndoProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { Loading, ErrorState } from "@/components/shared/States"
import { Button } from "@/components/ui/button"
import { downloadCsv, todayStamp } from "@/lib/csv"
import { money, CURRENCIES } from "@/lib/finance"
import { slotLabel, CASHFLOW_TEMPLATES } from "@/lib/cashAccounts"
import { cn } from "@/lib/utils"
import type { CashAccount } from "@/types"
import { buildSlotGraph } from "@/lib/cashflowGraph"
import { CashGrid } from "./CashGrid"
import { CashFlowCanvas } from "./CashFlowCanvas"

const WORKSPACE_ID = "00000000-0000-0000-0000-0000000000e1"
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
  const [slots, setSlots] = useState<CashAccount[]>([])
  const [opening, setOpening] = useState<Record<string, number>>({})
  const [defaultCurrency, setDefaultCurrency] = useState("KRW")
  const [showSettings, setShowSettings] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [{ data: slotData, error: e }, { data: settings }] = await Promise.all([
        supabase.from("cash_accounts").select("*").is("deleted_at", null).order("sort_order"),
        supabase.from("cashflow_settings").select("opening_cash, default_currency").maybeSingle(),
      ])
      if (e) throw e
      setSlots((slotData as CashAccount[]) ?? [])
      setOpening((settings?.opening_cash as Record<string, number>) ?? {})
      setDefaultCurrency(settings?.default_currency ?? "KRW")
      setError(null)
    } catch {
      setError("현금흐름을 불러오지 못했어요.")
    } finally {
      setLoading(false)
    }
  }, [supabase])

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

  const graph = useMemo(() => buildSlotGraph(slots, opening, defaultCurrency), [slots, opening, defaultCurrency])
  const currencies = useMemo(() => Array.from(new Set([defaultCurrency, ...slots.map((s) => s.currency)])), [defaultCurrency, slots])

  // ── 설정(보유현금·기본통화) — 입력 즉시 흐름도 반영 + 저장(upsert) ──
  const saveSettings = async (nextOpening: Record<string, number>, nextCurrency: string) => {
    await mustOk(
      supabase
        .from("cashflow_settings")
        .upsert({ workspace_id: WORKSPACE_ID, opening_cash: nextOpening, default_currency: nextCurrency, updated_by: me, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" })
    )
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
  const addSlot = async () => {
    if (!me) return
    const { error: e } = await supabase
      .from("cash_accounts")
      .insert({ name: "새 항목", kind: "expense_dst", color: "red", created_by: me, sort_order: slots.length })
    if (e) return toast.error("항목을 추가하지 못했어요.")
    load()
  }
  const updateSlot = async (id: string, patch: Partial<CashAccount>) => {
    await mustOk(supabase.from("cash_accounts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id))
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
  const exportCsv = () => {
    const headers = ["항목", "구분", "금액", "통화"]
    const rows = slots.map((s) => [s.name, slotLabel(s.kind), Number(s.amount), s.currency])
    downloadCsv(`현금흐름_${todayStamp()}.csv`, headers, rows)
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
            <h3 className="text-sm font-semibold">현금 흐름도</h3>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", graph.pool.available < 0 ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600")}>
              가용현금 {money(graph.pool.available, graph.pool.currency)}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", graph.pool.netProfit < 0 ? "bg-rose-500/10 text-rose-600" : "bg-blue-500/10 text-blue-600")}>
              순이익 {money(graph.pool.netProfit, graph.pool.currency)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant={showSettings ? "default" : "outline"} onClick={() => setShowSettings((v) => !v)}>
              <Settings className="size-3.5" /> 설정
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={slots.length === 0}>
              <Download className="size-3.5" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportPdf} disabled={slots.length === 0}>
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
        <CashFlowCanvas nodes={graph.nodes} edges={graph.edges} onMoveAccount={(id, x, y) => updateSlot(id, { x, y })} />
      </div>

      {/* 슬롯 표 — 금액 직접 입력 */}
      <CashGrid slots={slots} onAddSlot={addSlot} onUpdateSlot={updateSlot} onDeleteSlot={deleteSlot} />
    </div>
  )
}
