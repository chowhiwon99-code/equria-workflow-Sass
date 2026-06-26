"use client"

import { useState } from "react"
import { X, Loader2, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { fieldClass } from "@/components/shared/Modal"
import { Button } from "@/components/ui/button"
import type { CashAccount } from "@/types"

/** 내 계좌 ↔ 내 계좌 이체 기록. 흐름도에서 출력 포트를 끌어 놓으면 from/to가 채워진 채 열린다. */
export function CashTransferModal({
  accounts,
  fromId,
  toId,
  onClose,
  onSaved,
}: {
  accounts: CashAccount[]
  fromId: string
  toId: string
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const me = useCurrentUserId()
  const [from, setFrom] = useState(fromId)
  const [to, setTo] = useState(toId)
  const [amount, setAmount] = useState("")
  const [fee, setFee] = useState("")
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"))
  const [memo, setMemo] = useState("")
  const [busy, setBusy] = useState(false)

  const fromAcc = accounts.find((a) => a.id === from)

  const save = async () => {
    const amt = Number(amount)
    if (from === to) return toast.error("같은 계좌로는 이체할 수 없어요.")
    if (!amt || amt <= 0) return toast.error("이체 금액을 입력해 주세요.")
    setBusy(true)
    try {
      await mustOk(
        supabase.from("cash_transfers").insert({
          from_account_id: from,
          to_account_id: to,
          amount: amt,
          fee_amount: Number(fee) || 0,
          currency: fromAcc?.currency ?? "KRW",
          transfer_date: date,
          memo: memo.trim() || null,
          created_by: me,
        })
      )
      toast.success("이체를 기록했어요.")
      onSaved()
    } catch {
      toast.error("이체 기록에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }

  const accOptions = (exclude: string) => accounts.filter((a) => a.id !== exclude)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl border bg-popover p-4 shadow-[var(--shadow-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">계좌 이체</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={cn(fieldClass, "flex-1")}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          <select value={to} onChange={(e) => setTo(e.target.value)} className={cn(fieldClass, "flex-1")}>
            {accOptions(from).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            금액
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" className={cn(fieldClass, "text-right tabular-nums")} autoFocus />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            수수료 (선택)
            <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="0" className={cn(fieldClass, "text-right tabular-nums")} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          날짜
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(fieldClass)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          메모 (선택)
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="이체 사유" className={cn(fieldClass)} />
        </label>

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy && <Loader2 className="size-3.5 animate-spin" />} 이체 기록
          </Button>
        </div>
      </div>
    </div>
  )
}
