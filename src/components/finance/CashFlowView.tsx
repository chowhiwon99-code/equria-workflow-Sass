"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Plus, Wallet } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { useUndo } from "@/components/undo/UndoProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { Loading, EmptyState, ErrorState } from "@/components/shared/States"
import { Button } from "@/components/ui/button"
import type { CashAccount, CashTransfer, FinanceEntry } from "@/types"
import { computeBalances } from "@/lib/cashflowGraph"
import { CashGrid } from "./CashGrid"

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
          <Button size="sm" variant="outline" onClick={addAccount}>
            <Plus className="size-3.5" /> 계좌 추가
          </Button>
        </div>
        <div className="grid h-64 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
          흐름도 — 다음 단계에서 연결됩니다
        </div>
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
    </div>
  )
}
