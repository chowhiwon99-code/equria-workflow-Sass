"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { useUndo } from "@/components/undo/UndoProvider"
import { won } from "@/lib/finance"
import type { TaxInvoice } from "@/types"

/** 세금계산서 초안 수정 모달 — 작성·정리 전용(전자발행 X). tax_update RLS(작성자) + Undo. */
export function TaxInvoiceModal({
  invoice,
  reload,
  onClose,
  onSaved,
}: {
  invoice: TaxInvoice
  reload: () => void
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const { push } = useUndo()
  const [direction, setDirection] = useState<"sales" | "purchase">(invoice.direction === "sales" ? "sales" : "purchase")
  const [issueDate, setIssueDate] = useState(invoice.issue_date ?? "")
  const [supplierName, setSupplierName] = useState(invoice.supplier_name ?? "")
  const [supply, setSupply] = useState(String(invoice.supply_amount ?? 0))
  const [tax, setTax] = useState(String(invoice.tax_amount ?? 0))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supplyNum = Number(supply || 0)
  const taxNum = Number(tax || 0)
  const total = supplyNum + taxNum

  const submit = async () => {
    setSaving(true)
    setError(null)
    const payload = {
      direction,
      issue_date: issueDate || null,
      supplier_name: supplierName.trim() || null,
      supply_amount: supplyNum,
      tax_amount: taxNum,
      total_amount: total,
      updated_at: new Date().toISOString(),
    }
    const before = {
      direction: invoice.direction,
      issue_date: invoice.issue_date,
      supplier_name: invoice.supplier_name,
      supply_amount: invoice.supply_amount,
      tax_amount: invoice.tax_amount,
      total_amount: invoice.total_amount,
      updated_at: invoice.updated_at,
    }
    const { error: err } = await supabase.from("tax_invoices").update(payload).eq("id", invoice.id)
    setSaving(false)
    if (err) return setError(err.message)
    push({
      label: "세금계산서 초안 수정",
      undo: async () => {
        await mustOk(supabase.from("tax_invoices").update(before).eq("id", invoice.id))
        reload()
      },
      redo: async () => {
        await mustOk(supabase.from("tax_invoices").update(payload).eq("id", invoice.id))
        reload()
      },
    })
    onSaved()
  }

  return (
    <Modal title="세금계산서 초안 수정" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {(["purchase", "sales"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={cn("flex-1 rounded-lg border py-1.5 text-sm", direction === d ? "border-primary bg-primary/10 font-medium" : "border-border")}
            >
              {d === "sales" ? "매출" : "매입"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            발행일
            <input type="date" className={fieldClass} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            공급자
            <input className={fieldClass} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="공급자명" />
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            공급가
            <input type="number" className={fieldClass} value={supply} onChange={(e) => setSupply(e.target.value)} />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            부가세
            <input type="number" className={fieldClass} value={tax} onChange={(e) => setTax(e.target.value)} />
          </label>
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          합계: <span className="font-semibold">{won(total)}</span>
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
