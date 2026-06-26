"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Plus, Wallet, Download, FileDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { useUndo } from "@/components/undo/UndoProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { Loading, EmptyState, ErrorState } from "@/components/shared/States"
import { Button } from "@/components/ui/button"
import { downloadCsv, todayStamp } from "@/lib/csv"
import { money } from "@/lib/finance"
import { kindLabel } from "@/lib/cashAccounts"
import type { CashAccount, CashTransfer, FinanceEntry } from "@/types"
import { computeBalances, buildGraph, buildMovements } from "@/lib/cashflowGraph"
import { CashGrid } from "./CashGrid"
import { CashFlowCanvas } from "./CashFlowCanvas"
import { CashTransferModal } from "./CashTransferModal"

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"))
const PRINT_CSS = `body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#111;margin:24px;-webkit-print-color-adjust:exact}h1{font-size:18px;margin:0}h2{font-size:14px;margin:18px 0 4px}.meta{color:#666;font-size:12px;margin:2px 0 0}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:4px 8px;text-align:left}th{background:#f5f5f5}.r{text-align:right;font-variant-numeric:tabular-nums}@media print{@page{margin:14mm}}`

/** 현금흐름 지도 — SSOT 부모. 계좌·거래·이체를 한 번 로드, 흐름도(다음 단계)와 그리드가 같은 데이터를 렌더. */
export function CashFlowView({ range }: { range: { start: string; end: string } | null }) {
  const supabase = createClient()
  const me = useCurrentUserId()
  const { push } = useUndo()
  const [accounts, setAccounts] = useState<CashAccount[]>([])
  const [entries, setEntries] = useState<FinanceEntry[]>([])
  const [transfers, setTransfers] = useState<CashTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transfer, setTransfer] = useState<{ from: string; to: string } | null>(null)

  const load = useCallback(async () => {
    try {
      let entQ = supabase.from("finance_entries").select("*").is("deleted_at", null)
      let trQ = supabase.from("cash_transfers").select("*").is("deleted_at", null)
      if (range) {
        entQ = entQ.gte("entry_date", range.start).lt("entry_date", range.end)
        trQ = trQ.gte("transfer_date", range.start).lt("transfer_date", range.end)
      }
      const [{ data: accs }, { data: ents }, { data: trs }] = await Promise.all([
        supabase.from("cash_accounts").select("*").is("deleted_at", null).order("sort_order"),
        entQ.order("entry_date", { ascending: false }),
        trQ.order("transfer_date", { ascending: false }),
      ])
      setAccounts((accs as CashAccount[]) ?? [])
      setEntries((ents as FinanceEntry[]) ?? [])
      setTransfers((trs as CashTransfer[]) ?? [])
      setError(null)
    } catch {
      setError("현금흐름을 불러오지 못했어요.")
    } finally {
      setLoading(false)
    }
  }, [supabase, range])

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

  const balances = useMemo(() => computeBalances(accounts, entries, transfers), [accounts, entries, transfers])
  const graph = useMemo(() => buildGraph(accounts, entries, transfers, { includeCategories: true }), [accounts, entries, transfers])
  const movements = useMemo(() => buildMovements(accounts, entries, transfers), [accounts, entries, transfers])

  // ── Export ──
  const exportCsv = () => {
    const headers = ["날짜", "구분", "계좌", "상대/분류", "통화", "금액", "메모"]
    const rows = movements.map((m) => [m.date, m.type, m.account, m.counter, m.currency, m.amount, m.memo])
    downloadCsv(`현금흐름_${todayStamp()}.csv`, headers, rows)
  }
  const exportPdf = () => {
    const win = window.open("", "_blank", "width=900,height=1000")
    if (!win) {
      toast.error("팝업이 차단됐어요. 허용 후 다시 시도해 주세요.")
      return
    }
    const accRows = accounts
      .map((a) => {
        const b = balances.get(a.id)
        return `<tr><td>${esc(a.name)}</td><td>${esc(kindLabel(a.kind))}</td><td class="r">${b ? esc(money(b.inflow, a.currency)) : ""}</td><td class="r">${b ? esc(money(b.outflow, a.currency)) : ""}</td><td class="r"><b>${b ? esc(money(b.balance, a.currency)) : ""}</b></td></tr>`
      })
      .join("")
    const movRows = movements
      .map((m) => `<tr><td>${m.date}</td><td>${m.type}</td><td>${esc(m.account)}</td><td>${esc(m.counter)}</td><td class="r">${esc(money(m.amount, m.currency))}</td><td>${esc(m.memo)}</td></tr>`)
      .join("")
    const period = range ? `${range.start} ~ ${range.end}` : "전체 기간"
    win.document.write(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>현금흐름</title><style>${PRINT_CSS}</style></head><body>` +
        `<h1>현금흐름 지도</h1><p class="meta">${period}</p>` +
        `<h2>계좌 / 잔액</h2><table><thead><tr><th>계좌</th><th>종류</th><th class="r">입금</th><th class="r">출금</th><th class="r">잔액</th></tr></thead><tbody>${accRows}</tbody></table>` +
        `<h2>거래 내역</h2><table><thead><tr><th>날짜</th><th>구분</th><th>계좌</th><th>상대/분류</th><th class="r">금액</th><th>메모</th></tr></thead><tbody>${movRows}</tbody></table>` +
        `<scr` +
        `ipt>window.onload=function(){setTimeout(function(){window.print()},300)}</scr` +
        `ipt></body></html>`
    )
    win.document.close()
  }

  // ── 계좌 CRUD ──
  const addAccount = async () => {
    if (!me) return
    const { data, error: e } = await supabase
      .from("cash_accounts")
      .insert({ name: "새 계좌", kind: "bank", created_by: me, sort_order: accounts.length })
      .select("id")
      .single()
    if (e || !data) return toast.error("계좌를 추가하지 못했어요.")
    load()
  }
  const updateAccount = async (id: string, patch: Partial<CashAccount>) => {
    await mustOk(supabase.from("cash_accounts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id))
    load()
  }
  const deleteAccount = async (acc: CashAccount) => {
    await supabase.from("cash_accounts").update({ deleted_at: new Date().toISOString() }).eq("id", acc.id)
    push({
      label: `계좌 "${acc.name}"을 삭제했어요.`,
      undo: async () => {
        await supabase.from("cash_accounts").update({ deleted_at: null }).eq("id", acc.id)
      },
      redo: async () => {
        await supabase.from("cash_accounts").update({ deleted_at: new Date().toISOString() }).eq("id", acc.id)
      },
    })
    load()
  }

  if (loading) return <Loading rows={6} />
  if (error) return <ErrorState message={error} onRetry={() => { setError(null); load() }} />

  return (
    <div className="flex flex-col gap-4">
      {/* 흐름도 (Step 4에서 CashFlowCanvas로 교체) */}
      <div className="flex flex-col gap-2 rounded-xl border bg-card/30 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">현금 흐름도</h3>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={movements.length === 0}>
              <Download className="size-3.5" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportPdf} disabled={accounts.length === 0}>
              <FileDown className="size-3.5" /> PDF
            </Button>
            <Button size="sm" variant="outline" onClick={addAccount}>
              <Plus className="size-3.5" /> 계좌 추가
            </Button>
          </div>
        </div>
        <CashFlowCanvas
          nodes={graph.nodes}
          edges={graph.edges}
          onMoveAccount={(id, x, y) => updateAccount(id, { x, y })}
          onCreateTransfer={(from, to) => setTransfer({ from, to })}
        />
      </div>

      {/* 그리드 (노션 DB식) */}
      {accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="계좌가 없어요"
          description="현금·통장·카드·사내보유금 등 계좌(버킷)를 추가해 회사의 돈 흐름을 그려보세요."
          action={
            <Button size="sm" onClick={addAccount}>
              <Plus className="size-3.5" /> 계좌 추가
            </Button>
          }
        />
      ) : (
        <CashGrid
          accounts={accounts}
          entries={entries}
          transfers={transfers}
          balances={balances}
          onAddAccount={addAccount}
          onUpdateAccount={updateAccount}
          onDeleteAccount={deleteAccount}
        />
      )}

      {transfer && (
        <CashTransferModal
          accounts={accounts}
          fromId={transfer.from}
          toId={transfer.to}
          onClose={() => setTransfer(null)}
          onSaved={() => {
            setTransfer(null)
            load()
          }}
        />
      )}
    </div>
  )
}
