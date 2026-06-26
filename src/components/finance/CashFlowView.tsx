"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Download, FileDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { useUndo } from "@/components/undo/UndoProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { Loading, ErrorState } from "@/components/shared/States"
import { Button } from "@/components/ui/button"
import { downloadCsv, todayStamp } from "@/lib/csv"
import { money } from "@/lib/finance"
import { slotLabel } from "@/lib/cashAccounts"
import { cn } from "@/lib/utils"
import type { CashAccount } from "@/types"
import { buildSlotGraph } from "@/lib/cashflowGraph"
import { CashGrid } from "./CashGrid"
import { CashFlowCanvas } from "./CashFlowCanvas"

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data, error: e } = await supabase.from("cash_accounts").select("*").is("deleted_at", null).order("sort_order")
      if (e) throw e
      setSlots((data as CashAccount[]) ?? [])
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

  const graph = useMemo(() => buildSlotGraph(slots), [slots])

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
    const netRows = graph.net.map((nt) => `<tr><td><b>회사 보유 현금</b></td><td></td><td class="r"><b>${esc(money(nt.amount, nt.currency))}</b></td></tr>`).join("")
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
      {/* 흐름도 */}
      <div className="flex flex-col gap-2 rounded-xl border bg-card/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">현금 흐름도</h3>
            {graph.net.map((nt) => (
              <span
                key={nt.currency}
                className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", nt.amount < 0 ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600")}
              >
                남는 현금 {money(nt.amount, nt.currency)}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={slots.length === 0}>
              <Download className="size-3.5" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportPdf} disabled={slots.length === 0}>
              <FileDown className="size-3.5" /> PDF
            </Button>
          </div>
        </div>
        <CashFlowCanvas nodes={graph.nodes} edges={graph.edges} onMoveAccount={(id, x, y) => updateSlot(id, { x, y })} />
      </div>

      {/* 슬롯 표 — 금액 직접 입력 */}
      <CashGrid slots={slots} onAddSlot={addSlot} onUpdateSlot={updateSlot} onDeleteSlot={deleteSlot} />
    </div>
  )
}
