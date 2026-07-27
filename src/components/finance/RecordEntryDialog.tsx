"use client"

import { useState } from "react"
import { Loader2, PenLine } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { DateInput } from "@/components/shared/DateInput"
import { money } from "@/lib/finance"
import type { CashAccount } from "@/types"

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * 슬롯 → 장부 기록 다이얼로그(SSOT 재설계) — 날짜·금액·메모만 받아 finance_entries에 기록.
 * 수식 슬롯은 계산값을 금액에 프리필. 실제 INSERT·Undo는 부모(CashFlowView.recordEntry)가 담당.
 */
export function RecordEntryDialog({
  slot,
  prefillAmount,
  onSubmit,
  onClose,
}: {
  slot: CashAccount
  prefillAmount?: number | null
  onSubmit: (input: { date: string; amount: number; memo: string }) => Promise<void>
  onClose: () => void
}) {
  const isRevenue = slot.kind === "revenue_src"
  const [date, setDate] = useState(todayStr())
  const [amount, setAmount] = useState(prefillAmount && prefillAmount > 0 ? String(Math.round(prefillAmount)) : "")
  const [memo, setMemo] = useState("")
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const n = Number(amount)
    if (!n || n <= 0) {
      toast.error("금액을 입력하세요.")
      return
    }
    if (!date) {
      toast.error("날짜를 선택하세요.")
      return
    }
    setBusy(true)
    try {
      await onSubmit({ date, amount: n, memo })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`${slot.name} · ${isRevenue ? "매출" : "비용"} 기록`} onClose={onClose} className="max-w-sm">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <label className="flex w-36 shrink-0 flex-col gap-1 text-xs text-muted-foreground">
            날짜
            <DateInput className="w-full" value={date} onChange={setDate} />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
            금액 ({slot.currency})
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              className={fieldClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) save()
              }}
              placeholder="0"
            />
          </label>
        </div>
        {prefillAmount != null && prefillAmount > 0 && (
          <p className="text-[11px] text-muted-foreground">수식 계산값 {money(prefillAmount, slot.currency)}을 채워뒀어요 — 수정 가능.</p>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          메모 <span className="font-normal text-muted-foreground/60">(선택)</span>
          <input
            className={fieldClass}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) save()
            }}
            placeholder="예: 11월 정산"
          />
        </label>
        <p className="rounded-lg bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
          장부(내역)에 기록되고 손익·추세·분류에 바로 반영돼요. 되돌리려면 ⌘Z.
        </p>
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <PenLine className="size-3.5" />} 기록
          </Button>
        </div>
      </div>
    </Modal>
  )
}
