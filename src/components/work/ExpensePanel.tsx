"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/shared/Select"
import { Loading } from "@/components/shared/States"
import { fieldClass } from "@/components/shared/Modal"
import { STATUS_BADGE } from "./status"

type Row = {
  id: string
  title: string
  amount: number
  category: string
  spent_on: string
  description: string | null
  status: string
  user_id: string
  created_at: string
}

const CATEGORIES = ["식비", "교통", "접대", "사무용품", "출장", "기타"] as const

export function ExpensePanel() {
  const supabase = createClient()
  const [me, setMe] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // 폼
  const [title, setTitle] = useState("")
  const [amount, setAmount] = useState("")
  const [category, setCategory] = useState<string>("식비")
  const [spentOn, setSpentOn] = useState(new Date().toLocaleDateString("en-CA"))
  const [desc, setDesc] = useState("")

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return setLoading(false)
    setMe(auth.user.id)
    const [{ data: prof }, { data: list }, { data: ppl }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", auth.user.id).single(),
      supabase
        .from("expense_reports")
        .select("id, title, amount, category, spent_on, description, status, user_id, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name"),
    ])
    setIsAdmin(prof?.role === "admin")
    setRows((list as Row[]) ?? [])
    setNames(Object.fromEntries((ppl ?? []).map((p) => [p.id, p.name])))
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      await load()
    } catch {
      toast.error("처리에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }

  const submit = () => {
    if (!me) return
    if (!title.trim() || !amount) {
      toast.error("제목과 금액을 입력해 주세요.")
      return
    }
    run(async () => {
      await mustOk(
        supabase.from("expense_reports").insert({
          user_id: me,
          title: title.trim(),
          amount: Number(amount),
          category,
          spent_on: spentOn,
          description: desc.trim() || null,
        })
      )
      setTitle("")
      setAmount("")
      setDesc("")
      toast.success("지출결의서를 제출했어요.")
    })
  }

  const review = (id: string, status: "승인" | "반려") =>
    run(async () => {
      await mustOk(
        supabase
          .from("expense_reports")
          .update({ status, reviewed_by: me, reviewed_at: new Date().toISOString() })
          .eq("id", id)
      )
    })

  const cancel = (id: string) =>
    run(async () => {
      await mustOk(supabase.from("expense_reports").delete().eq("id", id))
    })

  if (loading) return <Loading rows={4} />

  return (
    <div className="flex flex-col gap-5">
      {/* 상태별 요약 — 한눈에 대기/승인/반려 건수·금액 */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(["대기", "승인", "반려"] as const).map((s) => {
            const items = rows.filter((r) => r.status === s)
            if (items.length === 0) return null
            const sum = items.reduce((a, r) => a + Number(r.amount), 0)
            return (
              <span key={s} className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium", STATUS_BADGE[s])}>
                {s} {items.length}건 · ₩{sum.toLocaleString()}
              </span>
            )
          })}
        </div>
      )}

      {/* 제출 폼 */}
      <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 text-sm font-semibold">새 지출결의서</h2>
        <div className="flex flex-col gap-2">
          <input className={fieldClass} placeholder="제목 (예: 거래처 점심)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              className={cn(fieldClass, "w-36")}
              placeholder="금액(원)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {amount && !isNaN(Number(amount)) && Number(amount) > 0 && (
              <span className="text-sm font-semibold tabular-nums text-primary">₩{Number(amount).toLocaleString()}</span>
            )}
            <Select value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c, label: c }))} className="h-9" />
            <input type="date" className={cn(fieldClass, "w-auto")} value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
          </div>
          <textarea
            className={cn(fieldClass, "h-16 resize-none py-2")}
            placeholder="설명 (선택)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={busy}>
              제출
            </Button>
          </div>
        </div>
      </div>

      {/* 목록 */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">{isAdmin ? "전체 지출결의서" : "내 지출결의서"}</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 제출된 지출결의서가 없어요.</p>
        ) : (
          <div className="flex flex-col divide-y rounded-xl border">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{r.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {r.category} · {r.spent_on.slice(5).replace("-", ".")}
                    {isAdmin && r.user_id !== me && ` · ${names[r.user_id] ?? "직원"}`}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">₩{Number(r.amount).toLocaleString()}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_BADGE[r.status])}>
                  {r.status}
                </span>
                {/* 관리자: 대기 건 승인/반려 */}
                {isAdmin && r.status === "대기" && (
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => review(r.id, "승인")} className="text-xs text-emerald-600 hover:underline" disabled={busy}>
                      승인
                    </button>
                    <button onClick={() => review(r.id, "반려")} className="text-xs text-destructive hover:underline" disabled={busy}>
                      반려
                    </button>
                  </div>
                )}
                {/* 본인: 대기 건 취소 */}
                {!isAdmin && r.user_id === me && r.status === "대기" && (
                  <button onClick={() => cancel(r.id)} className="shrink-0 text-xs text-muted-foreground hover:text-destructive" disabled={busy}>
                    취소
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
