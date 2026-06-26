"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { useUndo } from "@/components/undo/UndoProvider"
import { categoriesFor, computeAmounts, won, CURRENCIES } from "@/lib/finance"
import type { FinanceEntry, CashAccount } from "@/types"

type Kind = "expense" | "revenue"

/** 비용·매출 직접입력/수정 모달 — computeAmounts 자동계산 + Undo(추가/수정). */
export function FinanceEntryModal({
  entry,
  reload,
  onClose,
  onSaved,
}: {
  entry: FinanceEntry | null
  reload: () => void
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const me = useCurrentUserId()
  const { push } = useUndo()
  const [kind, setKind] = useState<Kind>((entry?.kind as Kind) ?? "expense")
  const [entryDate, setEntryDate] = useState(entry?.entry_date ?? new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState(entry?.category ?? "")
  const [vendor, setVendor] = useState(entry?.vendor ?? "")
  const [quantity, setQuantity] = useState<string>(entry?.quantity != null ? String(entry.quantity) : "")
  const [unitPrice, setUnitPrice] = useState<string>(entry?.unit_price != null ? String(entry.unit_price) : "")
  const [amount, setAmount] = useState<string>(entry ? String(entry.amount) : "")
  const [tax, setTax] = useState<string>(entry ? String(entry.tax_amount) : "")
  const [fee, setFee] = useState<string>(entry ? String(entry.fee_amount) : "")
  const [currency, setCurrency] = useState<string>(entry?.currency ?? "KRW")
  const [accountId, setAccountId] = useState<string | null>(entry?.account_id ?? null)
  const [accounts, setAccounts] = useState<Pick<CashAccount, "id" | "name">[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void supabase
      .from("cash_accounts")
      .select("id, name")
      .is("deleted_at", null)
      .order("sort_order")
      .then(({ data }) => setAccounts((data as Pick<CashAccount, "id" | "name">[]) ?? []))
  }, [supabase])

  const num = (s: string) => (s === "" ? null : Number(s))
  const computed = computeAmounts({
    kind,
    quantity: num(quantity),
    unitPrice: num(unitPrice),
    amount: num(amount),
    tax: num(tax),
    fee: num(fee),
  })

  const submit = async () => {
    setSaving(true)
    setError(null)
    if (!me) {
      setError("로그인이 필요합니다.")
      setSaving(false)
      return
    }
    const payload = {
      kind,
      entry_date: entryDate,
      category: category || null,
      vendor: vendor || null,
      quantity: num(quantity),
      unit_price: num(unitPrice),
      amount: computed.amount,
      tax_amount: kind === "expense" ? Number(tax || 0) : 0,
      fee_amount: kind === "revenue" ? Number(fee || 0) : 0,
      total_amount: computed.total,
      currency,
      account_id: accountId,
      source: "manual" as const,
      status: "confirmed" as const,
    }
    if (entry) {
      // 수정 — 되돌리기 위해 변경된 컬럼의 이전 값을 보존
      const before = {
        kind: entry.kind,
        entry_date: entry.entry_date,
        category: entry.category,
        vendor: entry.vendor,
        quantity: entry.quantity,
        unit_price: entry.unit_price,
        amount: entry.amount,
        tax_amount: entry.tax_amount,
        fee_amount: entry.fee_amount,
        total_amount: entry.total_amount,
        currency: entry.currency,
        account_id: entry.account_id,
      }
      const { error: err } = await supabase.from("finance_entries").update(payload).eq("id", entry.id)
      setSaving(false)
      if (err) return setError(err.message)
      push({
        label: "항목 수정",
        undo: async () => {
          await mustOk(supabase.from("finance_entries").update(before).eq("id", entry.id))
          reload()
        },
        redo: async () => {
          await mustOk(supabase.from("finance_entries").update(payload).eq("id", entry.id))
          reload()
        },
      })
    } else {
      const { data: inserted, error: err } = await supabase
        .from("finance_entries")
        .insert({ ...payload, created_by: me })
        .select()
        .single()
      setSaving(false)
      if (err) return setError(err.message)
      if (inserted) {
        push({
          label: "항목 추가",
          undo: async () => {
            await mustOk(supabase.from("finance_entries").delete().eq("id", inserted.id))
            reload()
          },
          redo: async () => {
            await mustOk(supabase.from("finance_entries").insert(inserted))
            reload()
          },
        })
      }
    }
    onSaved()
  }

  const cats = categoriesFor(kind)

  return (
    <Modal title={entry ? "항목 수정" : "직접 입력"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {(["expense", "revenue"] as Kind[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k)
                setCategory("")
              }}
              className={cn("flex-1 rounded-lg border py-1.5 text-sm", kind === k ? "border-primary bg-primary/10 font-medium" : "border-border")}
            >
              {k === "expense" ? "비용(지출)" : "매출"}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            날짜
            <input type="date" className={fieldClass} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            분류
            <select className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">선택…</option>
              {cats.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            통화
            <select className={fieldClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-xs text-muted-foreground">
          거래처/항목명
          <input className={fieldClass} value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="예: 네이버스마트, 레뷰 등" />
        </label>

        <label className="text-xs text-muted-foreground">
          계좌 <span className="text-[11px]">(선택 — 현금흐름 지도에 반영)</span>
          <select className={fieldClass} value={accountId ?? ""} onChange={(e) => setAccountId(e.target.value || null)}>
            <option value="">계좌 미지정</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            갯수
            <input type="number" className={fieldClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="선택" />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            단가
            <input type="number" className={fieldClass} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="선택" />
          </label>
        </div>

        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            공급가 {num(quantity) != null && num(unitPrice) != null && <span className="text-primary">(자동계산됨)</span>}
            <input
              type="number"
              className={fieldClass}
              value={num(quantity) != null && num(unitPrice) != null ? String(computed.amount) : amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={num(quantity) != null && num(unitPrice) != null}
            />
          </label>
          {kind === "expense" ? (
            <label className="flex-1 text-xs text-muted-foreground">
              부가세
              <input type="number" className={fieldClass} value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0" />
            </label>
          ) : (
            <label className="flex-1 text-xs text-muted-foreground">
              수수료
              <input type="number" className={fieldClass} value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
            </label>
          )}
        </div>

        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          합계: <span className="font-semibold">{won(computed.total)}</span>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "저장 중…" : "저장"}</Button>
        </div>
      </div>
    </Modal>
  )
}
