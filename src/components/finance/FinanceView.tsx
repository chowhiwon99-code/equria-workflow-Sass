"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Upload, FileText, Loader2, Plus, Pencil, Download, Trash2, Receipt } from "lucide-react"
import { Select } from "@/components/shared/Select"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { uploadImage } from "@/lib/upload"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { Loading } from "@/components/shared/States"
import { useUndo } from "@/components/undo/UndoProvider"
import { categoriesFor, computeAmounts, won, money, CURRENCIES, EXPENSE_CATEGORIES, REVENUE_CATEGORIES } from "@/lib/finance"
import { downloadCsv, todayStamp } from "@/lib/csv"
import type { FinanceEntry, TaxInvoice } from "@/types"

type Kind = "expense" | "revenue"
type KindFilter = "all" | Kind
const PAGE_SIZE = 50

export function FinanceView() {
  const supabase = createClient()
  const { push } = useUndo()
  const [entries, setEntries] = useState<FinanceEntry[]>([])
  const [invoices, setInvoices] = useState<TaxInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<FinanceEntry | null>(null)
  const [editingTax, setEditingTax] = useState<TaxInvoice | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 필터·페이지네이션
  const [searchText, setSearchText] = useState("")
  const [kindFilter, setKindFilter] = useState<KindFilter>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [pageCount, setPageCount] = useState(1) // 누적 표시 페이지 수
  const [totalCount, setTotalCount] = useState(0)
  // 합계는 필터된 전체 기준(페이지 무관). 통화별로 분리(서로 다른 통화는 합산하지 않음).
  const [totals, setTotals] = useState<{
    byCat: Record<string, number>
    byCurrency: Record<string, { revenue: number; expense: number }>
  }>({ byCat: {}, byCurrency: {} })

  const load = useCallback(async () => {
    setLoading(true)
    const s = `%${searchText.trim()}%`
    // 1) 페이지된 행 (휴지통 제외 — deleted_at is null)
    let rowsQ = supabase.from("finance_entries").select("*", { count: "exact" }).is("deleted_at", null)
    if (kindFilter !== "all") rowsQ = rowsQ.eq("kind", kindFilter)
    if (categoryFilter) rowsQ = rowsQ.eq("category", categoryFilter)
    if (searchText.trim()) rowsQ = rowsQ.or(`vendor.ilike.${s},description.ilike.${s}`)
    const rowsP = rowsQ.order("entry_date", { ascending: false }).range(0, pageCount * PAGE_SIZE - 1)

    // 2) 합계 (필터된 전체, 휴지통 제외)
    let sumQ = supabase.from("finance_entries").select("kind, category, total_amount, currency").is("deleted_at", null)
    if (kindFilter !== "all") sumQ = sumQ.eq("kind", kindFilter)
    if (categoryFilter) sumQ = sumQ.eq("category", categoryFilter)
    if (searchText.trim()) sumQ = sumQ.or(`vendor.ilike.${s},description.ilike.${s}`)

    // 3) 세금계산서 초안 (필터 무관)
    const invQ = supabase.from("tax_invoices").select("*").order("created_at", { ascending: false })

    const [rowsRes, sumRes, invRes] = await Promise.all([rowsP, sumQ, invQ])
    setEntries(rowsRes.data ?? [])
    setTotalCount(rowsRes.count ?? 0)
    setInvoices(invRes.data ?? [])

    const t = {
      byCat: {} as Record<string, number>,
      byCurrency: {} as Record<string, { revenue: number; expense: number }>,
    }
    for (const e of (sumRes.data as { kind: string; category: string | null; total_amount: number; currency: string | null }[]) ?? []) {
      const cur = e.currency || "KRW"
      const amt = Number(e.total_amount)
      const bc = (t.byCurrency[cur] ??= { revenue: 0, expense: 0 })
      if (e.kind === "revenue") bc.revenue += amt
      else {
        bc.expense += amt
        // 분류별 지출 차트는 원화 항목만(통화 혼합 방지)
        if (cur === "KRW") {
          const k = e.category || "기타"
          t.byCat[k] = (t.byCat[k] ?? 0) + amt
        }
      }
    }
    setTotals(t)
    setLoading(false)
  }, [supabase, searchText, kindFilter, categoryFilter, pageCount])

  useEffect(() => {
    load()
  }, [load])

  // 필터/검색 변경 시 페이지 리셋
  useEffect(() => {
    setPageCount(1)
  }, [searchText, kindFilter, categoryFilter])

  const onUpload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const path = await uploadImage("receipts", file)
      const res = await fetch("/api/finance/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "OCR 실패")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  // 첨부 영수증(이미지/PDF) 열람 — 서버에서 가시성 인가 후 60초 서명 URL.
  const viewReceipt = async (id: string) => {
    try {
      const res = await fetch("/api/finance/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: id }),
      })
      if (!res.ok) throw new Error()
      const { url } = (await res.json()) as { url: string }
      window.open(url, "_blank")
    } catch {
      toast.error("영수증을 열 수 없어요.")
    }
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const exportCsv = async () => {
    // 현재 필터된 전체 행을 받아옴 (페이지네이션 무시, 휴지통 제외)
    let q = supabase.from("finance_entries").select("*").is("deleted_at", null)
    if (kindFilter !== "all") q = q.eq("kind", kindFilter)
    if (categoryFilter) q = q.eq("category", categoryFilter)
    if (searchText.trim()) {
      const s = `%${searchText.trim()}%`
      q = q.or(`vendor.ilike.${s},description.ilike.${s}`)
    }
    const { data } = await q.order("entry_date", { ascending: false })
    const headers = ["날짜", "구분", "분류", "통화", "거래처/항목", "갯수", "단가", "공급가", "부가세", "수수료", "합계", "상태"]
    const rows = (data ?? []).map((e) => [
      e.entry_date,
      e.kind === "revenue" ? "매출" : "비용",
      e.category ?? "",
      e.currency ?? "KRW",
      e.vendor ?? e.description ?? "",
      e.quantity ?? "",
      e.unit_price ?? "",
      e.amount,
      e.tax_amount,
      e.fee_amount,
      e.total_amount,
      e.status === "confirmed" ? "확정" : "검토필요",
    ])
    downloadCsv(`비용매출_${todayStamp()}.csv`, headers, rows)
  }

  const createInvoice = async () => {
    if (selected.size === 0) return
    setError(null)
    const res = await fetch("/api/finance/tax-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryIds: [...selected], direction: "purchase" }),
    })
    const json = await res.json()
    if (!res.ok) return setError(json.error ?? "초안 생성 실패")
    setSelected(new Set())
    load()
  }

  const deleteSelected = async () => {
    if (selected.size === 0) return
    if (!confirm(`선택한 ${selected.size}건을 삭제할까요?`)) return
    setError(null)
    const ids = [...selected]
    // soft-delete: deleted_at 마킹 (행·영수증 파일 보존 → 휴지통/Undo 복구 가능)
    const { error: err } = await supabase
      .from("finance_entries")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids)
    if (err) return setError(err.message)
    push({
      label: `${ids.length}건 삭제`,
      undo: async () => {
        await mustOk(supabase.from("finance_entries").update({ deleted_at: null }).in("id", ids))
        load()
      },
      redo: async () => {
        await mustOk(supabase.from("finance_entries").update({ deleted_at: new Date().toISOString() }).in("id", ids))
        load()
      },
    })
    setSelected(new Set())
    load()
  }

  const allOnPageSelected = entries.length > 0 && entries.every((e) => selected.has(e.id))
  const someOnPageSelected = entries.some((e) => selected.has(e.id))
  const toggleAllOnPage = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) entries.forEach((e) => next.delete(e.id))
      else entries.forEach((e) => next.add(e.id))
      return next
    })

  // 요약 집계 (필터된 전체 기준 — 별도 쿼리에서 계산됨). 통화별로 분리.
  const expenseByCat = totals.byCat
  // 통화 순서: KRW 먼저, 그다음 금액 큰 순
  const currencyRows = Object.entries(totals.byCurrency).sort(([a, av], [b, bv]) => {
    if (a === "KRW") return -1
    if (b === "KRW") return 1
    return bv.revenue + bv.expense - (av.revenue + av.expense)
  })
  const hasMore = entries.length < totalCount
  // 비용·매출 분류에 "기타" 등 중복 항목이 있어 Set 으로 중복 제거 (select key 충돌 방지)
  const allCategories = [...new Set([...EXPENSE_CATEGORIES, ...REVENUE_CATEGORIES])]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">비용·매출</h1>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={createInvoice}>
                <FileText /> 세금계산서 초안 ({selected.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={deleteSelected}
                className="border-destructive/30 text-destructive hover:bg-destructive-bg hover:text-destructive"
              >
                <Trash2 /> 삭제 ({selected.size})
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={entries.length === 0}>
            <Download /> 엑셀
          </Button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            {uploading ? "분석 중…" : "영수증·세금계산서 (이미지/PDF)"}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> 직접 입력
          </Button>
        </div>
      </div>

      {/* 순수익 요약 — 통화별 */}
      <div className="flex flex-col gap-3">
        {currencyRows.length === 0 ? (
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="총 매출" value={won(0)} className="text-success" />
            <SummaryCard label="총 지출" value={won(0)} className="text-destructive" />
            <SummaryCard label="순수익" value={won(0)} />
          </div>
        ) : (
          currencyRows.map(([cur, v]) => {
            const net = v.revenue - v.expense
            return (
              <div key={cur} className="flex flex-col gap-1.5">
                {currencyRows.length > 1 && (
                  <span className="text-xs font-medium text-muted-foreground">
                    {CURRENCIES.find((c) => c.code === cur)?.label ?? cur}
                  </span>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <SummaryCard label="총 매출" value={money(v.revenue, cur)} className="text-success" />
                  <SummaryCard label="총 지출" value={money(v.expense, cur)} className="text-destructive" />
                  <SummaryCard label="순수익" value={money(net, cur)} className={net >= 0 ? "text-foreground" : "text-destructive"} />
                </div>
              </div>
            )
          })
        )}
      </div>

      {Object.keys(expenseByCat).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(expenseByCat).map(([cat, amt]) => (
            <span key={cat} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {cat} <span className="font-medium text-foreground">{won(amt)}</span>
            </span>
          ))}
        </div>
      )}

      {/* 필터·검색 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          className={cn(fieldClass, "w-56")}
          placeholder="거래처/항목 검색…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Select
          value={kindFilter}
          onChange={(v) => setKindFilter(v as KindFilter)}
          options={[
            { value: "all", label: "전체" },
            { value: "expense", label: "비용" },
            { value: "revenue", label: "매출" },
          ]}
        />
        <Select
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={[{ value: "", label: "분류: 전체" }, ...allCategories.map((c) => ({ value: c, label: c }))]}
        />
        {(searchText || kindFilter !== "all" || categoryFilter) && (
          <button
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => {
              setSearchText("")
              setKindFilter("all")
              setCategoryFilter("")
            }}
          >
            필터 초기화
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          총 {totalCount.toLocaleString()}건
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* 표 */}
      {loading ? (
        <Loading rows={6} />
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Upload className="size-8" />
          <p className="text-sm">영수증 OCR 또는 직접 입력으로 비용·매출을 기록하세요.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[860px] text-sm tabular-nums [&_td]:align-middle [&_th]:align-middle">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected
                    }}
                    onChange={toggleAllOnPage}
                    aria-label="현재 페이지 전체 선택"
                  />
                </th>
                <th className="px-3 py-2 font-medium">날짜</th>
                <th className="px-3 py-2 font-medium">구분</th>
                <th className="px-3 py-2 font-medium">분류</th>
                <th className="px-3 py-2 font-medium">거래처/항목</th>
                <th className="px-3 py-2 text-right font-medium">갯수</th>
                <th className="px-3 py-2 text-right font-medium">단가</th>
                <th className="px-3 py-2 text-right font-medium">공급가</th>
                <th className="px-3 py-2 text-right font-medium">부가세/수수료</th>
                <th className="px-3 py-2 text-right font-medium">합계</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="w-16 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{e.entry_date}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", e.kind === "revenue" ? "bg-success-bg text-success" : "bg-destructive-bg text-destructive")}>
                      {e.kind === "revenue" ? "매출" : "비용"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{e.category ?? "—"}</td>
                  <td className="px-3 py-2 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="truncate">{e.vendor ?? e.description ?? "—"}</span>
                      {e.receipt_url && (
                        <button
                          onClick={() => viewReceipt(e.id)}
                          title="첨부 영수증 보기"
                          className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                        >
                          <Receipt className="size-3.5" />
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{e.quantity ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{e.unit_price != null ? money(e.unit_price, e.currency) : "—"}</td>
                  <td className="px-3 py-2 text-right">{money(e.amount, e.currency)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{money(e.kind === "revenue" ? e.fee_amount : e.tax_amount, e.currency)}</td>
                  <td className="px-3 py-2 text-right font-medium">{money(e.total_amount, e.currency)}</td>
                  <td className="px-3 py-2">
                    {e.status === "draft" ? (
                      <button
                        onClick={async () => {
                          await supabase.from("finance_entries").update({ status: "confirmed" }).eq("id", e.id)
                          push({
                            label: "확정 처리",
                            undo: async () => {
                              await mustOk(supabase.from("finance_entries").update({ status: "draft" }).eq("id", e.id))
                              load()
                            },
                            redo: async () => {
                              await mustOk(supabase.from("finance_entries").update({ status: "confirmed" }).eq("id", e.id))
                              load()
                            },
                          })
                          load()
                        }}
                        className="rounded-full bg-warning-bg px-2 py-0.5 text-xs text-warning transition-opacity hover:opacity-80"
                      >
                        검토→확정
                      </button>
                    ) : (
                      <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs text-success">확정</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setEditing(e)} className="text-muted-foreground hover:text-foreground" aria-label="수정">
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`이 항목을 삭제할까요?\n(${e.vendor ?? e.description ?? ""} · ${money(e.total_amount, e.currency)})`)) return
                          // soft-delete: deleted_at 마킹 (행·영수증 보존 → Undo 복구)
                          const { error: err } = await supabase
                            .from("finance_entries")
                            .update({ deleted_at: new Date().toISOString() })
                            .eq("id", e.id)
                          if (err) return setError(err.message)
                          push({
                            label: "항목 삭제",
                            undo: async () => {
                              await mustOk(supabase.from("finance_entries").update({ deleted_at: null }).eq("id", e.id))
                              load()
                            },
                            redo: async () => {
                              await mustOk(supabase.from("finance_entries").update({ deleted_at: new Date().toISOString() }).eq("id", e.id))
                              load()
                            },
                          })
                          setSelected((prev) => {
                            const next = new Set(prev)
                            next.delete(e.id)
                            return next
                          })
                          load()
                        }}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="삭제"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setPageCount((p) => p + 1)}>
            더 보기 ({entries.length} / {totalCount})
          </Button>
        </div>
      )}

      {/* 세금계산서 초안 */}
      {invoices.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">세금계산서 초안</h2>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm tabular-nums [&_td]:align-middle [&_th]:align-middle">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">발행일</th>
                  <th className="px-3 py-2 font-medium">구분</th>
                  <th className="px-3 py-2 font-medium">공급자</th>
                  <th className="px-3 py-2 text-right font-medium">공급가</th>
                  <th className="px-3 py-2 text-right font-medium">부가세</th>
                  <th className="px-3 py-2 text-right font-medium">합계</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((iv) => (
                  <tr key={iv.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{iv.issue_date ?? "—"}</td>
                    <td className="px-3 py-2">{iv.direction === "sales" ? "매출" : "매입"}</td>
                    <td className="px-3 py-2">{iv.supplier_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{won(iv.supply_amount)}</td>
                    <td className="px-3 py-2 text-right">{won(iv.tax_amount)}</td>
                    <td className="px-3 py-2 text-right font-medium">{won(iv.total_amount)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setEditingTax(iv)} className="text-muted-foreground hover:text-foreground" aria-label="초안 수정">
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`이 세금계산서 초안을 삭제할까요?\n(${iv.supplier_name ?? "—"} · ${won(iv.total_amount)})`)) return
                            // 하드 삭제 + Undo(전체 행 재삽입) — tax_invoices엔 deleted_at 없음(캘린더 삭제 패턴)
                            const { error: err } = await supabase.from("tax_invoices").delete().eq("id", iv.id)
                            if (err) return setError(err.message)
                            push({
                              label: "세금계산서 초안 삭제",
                              undo: async () => {
                                await mustOk(supabase.from("tax_invoices").insert(iv))
                                load()
                              },
                              redo: async () => {
                                await mustOk(supabase.from("tax_invoices").delete().eq("id", iv.id))
                                load()
                              },
                            })
                            load()
                          }}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="초안 삭제"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">※ 초안 작성·정리 전용. 실제 전자세금계산서 발행은 홈택스/팝빌에서 진행하세요.</p>
        </div>
      )}

      {(creating || editing) && (
        <FinanceEntryModal
          entry={editing}
          reload={load}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            load()
          }}
        />
      )}

      {editingTax && (
        <TaxInvoiceModal
          invoice={editingTax}
          reload={load}
          onClose={() => setEditingTax(null)}
          onSaved={() => {
            setEditingTax(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums", className)}>{value}</p>
    </div>
  )
}

function FinanceEntryModal({
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
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
        .insert({ ...payload, created_by: auth.user.id })
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

/** 세금계산서 초안 수정 모달 — 작성·정리 전용(전자발행 X). tax_update RLS(작성자) + Undo. */
function TaxInvoiceModal({
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
