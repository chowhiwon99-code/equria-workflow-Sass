"use client"

import { useState } from "react"
import { X, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { fieldClass } from "@/components/shared/Modal"
import { Button } from "@/components/ui/button"
import { CALC_TEMPLATES, formulaToText, evalFormula, type CalcField, type CalcNode } from "@/lib/calcFormula"
import { money } from "@/lib/finance"
import type { CashCalcType } from "@/types"

const WORKSPACE_ID = "00000000-0000-0000-0000-0000000000e1"
const flowLabel = (flow: string) => (flow === "revenue" ? "매출" : flow === "reserve" ? "보유금" : "비용")

/** 회사가 계산 유형(필드 + 수식)을 직접 정의 — 템플릿에서 시작, 필드 이름 변경, 미리보기 후 저장. */
export function CalcTypeBuilder({ types, onClose, onSaved }: { types: CashCalcType[]; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const me = useCurrentUserId()
  const [name, setName] = useState("")
  const [flow, setFlow] = useState<"revenue" | "expense" | "reserve">("expense")
  const [fields, setFields] = useState<CalcField[]>([])
  const [ast, setAst] = useState<CalcNode | null>(null)
  const [busy, setBusy] = useState(false)

  const pickTemplate = (id: string) => {
    const t = CALC_TEMPLATES.find((x) => x.id === id)
    if (!t) return
    setName((n) => n || t.label.split(" — ")[0])
    setFlow(t.flow)
    setFields(t.fields.map((f) => ({ ...f })))
    setAst(t.ast)
  }
  const setLabel = (key: string, label: string) => setFields((fs) => fs.map((f) => (f.key === key ? { ...f, label } : f)))

  const preview = ast ? formulaToText(ast, fields) : ""
  const sample = ast ? evalFormula(ast, Object.fromEntries(fields.map((f) => [f.key, f.kind === "percent" ? 0.1 : 100]))) : 0

  const save = async () => {
    if (!me) return
    if (!name.trim()) return toast.error("유형 이름을 입력해 주세요.")
    if (!ast) return toast.error("템플릿을 선택해 주세요.")
    setBusy(true)
    try {
      await mustOk(
        supabase.from("cash_calc_types").insert({
          workspace_id: WORKSPACE_ID,
          name: name.trim(),
          flow,
          fields,
          formula: { ast },
          created_by: me,
          sort_order: types.length,
        })
      )
      toast.success("계산 유형을 추가했어요.")
      setName("")
      setAst(null)
      setFields([])
      onSaved()
    } catch {
      toast.error("저장에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }
  const del = async (id: string) => {
    await supabase.from("cash_calc_types").delete().eq("id", id)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-2xl border bg-popover p-4 shadow-[var(--shadow-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">계산 유형 만들기</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">템플릿에서 시작</span>
          {CALC_TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => pickTemplate(t.id)} className="rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted">
              <span className="mr-1 rounded bg-muted px-1 py-0.5">{flowLabel(t.flow)}</span>
              {t.label}
            </button>
          ))}
        </div>

        {ast && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                유형 이름
                <input value={name} onChange={(e) => setName(e.target.value)} className={cn(fieldClass)} placeholder="예: 채널 매출" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                구분
                <select value={flow} onChange={(e) => setFlow(e.target.value as typeof flow)} className={cn(fieldClass)}>
                  <option value="revenue">매출</option>
                  <option value="expense">비용</option>
                  <option value="reserve">보유금</option>
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">입력 필드 (이름 변경 가능)</span>
              {fields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <input value={f.label} onChange={(e) => setLabel(f.key, e.target.value)} className={cn(fieldClass, "flex-1")} />
                  <span className="w-12 shrink-0 text-center text-xs text-muted-foreground">{f.kind === "percent" ? "%" : "숫자"}</span>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <p className="text-muted-foreground">
                수식: <span className="font-medium text-foreground">{preview}</span>
              </p>
              <p className="mt-0.5 text-muted-foreground">
                예시(각 100·%는 10%): <span className="font-semibold tabular-nums text-foreground">{money(sample, "KRW")}</span>
              </p>
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={save} disabled={busy}>
                {busy && <Loader2 className="size-3.5 animate-spin" />} 추가
              </Button>
            </div>
          </>
        )}

        {types.length > 0 && (
          <div className="flex flex-col gap-1 border-t pt-2">
            <span className="text-xs text-muted-foreground">내 계산 유형</span>
            {types.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs">
                <span>
                  <span className="mr-1 rounded bg-muted px-1 py-0.5">{flowLabel(t.flow)}</span>
                  {t.name}
                </span>
                <button onClick={() => del(t.id)} className="text-muted-foreground hover:text-destructive" aria-label="삭제">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
