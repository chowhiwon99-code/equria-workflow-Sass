"use client"

import { Trash2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { money, CURRENCIES } from "@/lib/finance"
import { ACCOUNT_KINDS } from "@/lib/cashAccounts"
import type { CashAccount, CashTransfer, FinanceEntry } from "@/types"
import { buildMovements, type Balance } from "@/lib/cashflowGraph"

/** 노션 데이터베이스식 그리드 — 계좌(인라인 편집) + 거래내역(읽기). 흐름도와 같은 데이터(SSOT). */
export function CashGrid({
  accounts,
  entries,
  transfers,
  balances,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
}: {
  accounts: CashAccount[]
  entries: FinanceEntry[]
  transfers: CashTransfer[]
  balances: Map<string, Balance>
  onAddAccount: () => void
  onUpdateAccount: (id: string, patch: Partial<CashAccount>) => void
  onDeleteAccount: (acc: CashAccount) => void
}) {
  const movements = buildMovements(accounts, entries, transfers)

  const th = "px-3 py-2 text-left font-medium"
  const thR = "px-3 py-2 text-right font-medium"

  return (
    <div className="flex flex-col gap-4">
      {/* 계좌 / 잔액 */}
      <section className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">계좌 / 잔액</h3>
          <button
            onClick={onAddAccount}
            className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-3" /> 계좌 추가
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className={th}>계좌명</th>
                <th className={th}>종류</th>
                <th className={th}>통화</th>
                <th className={thR}>기초잔액</th>
                <th className={thR}>입금</th>
                <th className={thR}>출금</th>
                <th className={thR}>잔액</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((a) => {
                const b = balances.get(a.id)
                return (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5">
                      <InlineText value={a.name} onCommit={(v) => onUpdateAccount(a.id, { name: v })} />
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={a.kind}
                        onChange={(e) => onUpdateAccount(a.id, { kind: e.target.value })}
                        className="rounded border-0 bg-transparent text-xs outline-none focus:ring-1 focus:ring-ring"
                      >
                        {ACCOUNT_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={a.currency}
                        onChange={(e) => onUpdateAccount(a.id, { currency: e.target.value })}
                        className="rounded border-0 bg-transparent text-xs outline-none focus:ring-1 focus:ring-ring"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <InlineNumber value={Number(a.opening_balance)} onCommit={(v) => onUpdateAccount(a.id, { opening_balance: v })} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">{b ? money(b.inflow, a.currency) : "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-rose-600">{b ? money(b.outflow, a.currency) : "—"}</td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{b ? money(b.balance, a.currency) : "—"}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button onClick={() => onDeleteAccount(a)} className="text-muted-foreground transition-colors hover:text-destructive" title="계좌 삭제">
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 거래 내역 */}
      <section className="flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold">
          거래 내역 <span className="text-xs font-normal text-muted-foreground">{movements.length}건</span>
        </h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className={th}>날짜</th>
                <th className={th}>구분</th>
                <th className={th}>계좌</th>
                <th className={th}>상대 / 분류</th>
                <th className={thR}>금액</th>
                <th className={th}>메모</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    거래가 없어요. 비용·매출 입력 또는 흐름도에서 이체를 만들어 보세요.
                  </td>
                </tr>
              ) : (
                movements.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/20">
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{m.date.slice(5).replace("-", ".")}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs",
                          m.type === "입금" ? "bg-emerald-500/10 text-emerald-600" : m.type === "출금" ? "bg-rose-500/10 text-rose-600" : "bg-blue-500/10 text-blue-600"
                        )}
                      >
                        {m.type}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">{m.account}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{m.counter}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(m.amount, m.currency)}</td>
                    <td className="max-w-40 truncate px-3 py-1.5 text-muted-foreground">{m.memo}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// 비제어 인라인 셀 — value 변경(재로드) 시 key로 리마운트, blur/Enter 시 커밋.
function InlineText({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  return (
    <input
      key={value}
      defaultValue={value}
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

function InlineNumber({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  return (
    <input
      key={value}
      defaultValue={String(value)}
      inputMode="decimal"
      onBlur={(e) => {
        const num = Number(e.target.value)
        if (!Number.isNaN(num) && num !== value) onCommit(num)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
      }}
      className="w-24 rounded border-0 bg-transparent px-1 py-0.5 text-right tabular-nums outline-none focus:bg-background focus:ring-1 focus:ring-ring"
    />
  )
}
