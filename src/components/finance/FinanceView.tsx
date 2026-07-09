"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Upload, FileText, Loader2, Plus, Pencil, Download, Trash2, Receipt } from "lucide-react"
import { Select } from "@/components/shared/Select"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { uploadImage } from "@/lib/upload"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { FilePreview } from "@/components/shared/FilePreview"
import { HoverPreview } from "@/components/shared/HoverPreview"
import { Loading, EmptyState } from "@/components/shared/States"
import { MonthStepper, currentYM, monthRange } from "@/components/shared/MonthStepper"
import { useUndo } from "@/components/undo/UndoProvider"
import { won, money, CURRENCIES, EXPENSE_CATEGORIES, REVENUE_CATEGORIES } from "@/lib/finance"
import { downloadCsv, todayStamp } from "@/lib/csv"
import type { FinanceEntry, TaxInvoice } from "@/types"
import { usePeriodFilter, prevMonth, type PeriodMode } from "./usePeriodFilter"
import { CashFlowView } from "./CashFlowView"
import { aggregateByCurrency, aggregateByCategory, toBreakdown, buildMonthlyTrend, type SumRow } from "./financeAgg"
import { SummaryCard, TrendBadge, TrendBars, BreakdownBars } from "./financeCharts"
import { FinanceEntryModal } from "./FinanceEntryModal"
import { TaxInvoiceModal } from "./TaxInvoiceModal"

type Kind = "expense" | "revenue"
type KindFilter = "all" | Kind
type Tab = "summary" | "cashflow" | "ledger" | "tax"
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
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; name: string; mime: string | null } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<Tab>("summary")
  // 필터·페이지네이션 (내역 탭 전용)
  const [searchText, setSearchText] = useState("")
  const [kindFilter, setKindFilter] = useState<KindFilter>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [pageCount, setPageCount] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // 기간 필터 — 기본 '전체'(무회귀). load·exportCsv가 동일 경계 공유.
  const { ym, setYm, mode, setMode, range } = usePeriodFilter("all")

  // 집계 raw — 요약 탭(선택기간) + 추세(6개월). 통화 분리는 financeAgg가 보장.
  const [sumRows, setSumRows] = useState<SumRow[]>([])
  const [trendRaw, setTrendRaw] = useState<SumRow[]>([])
  const [trendCur, setTrendCur] = useState("KRW")
  // 원화 환산용 일별 환율(krw_per_unit). 통화별 분리는 유지하고 '환산 합계'에만 사용.
  const [fx, setFx] = useState<{ base: string; as_of: string | null; rates: Record<string, number> } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const s = `%${searchText.trim()}%`
    // 1) 페이지된 행 (내역 탭 — 검색/구분/분류 + 기간 필터, 휴지통 제외)
    let rowsQ = supabase.from("finance_entries").select("*", { count: "exact" }).is("deleted_at", null)
    if (kindFilter !== "all") rowsQ = rowsQ.eq("kind", kindFilter)
    if (categoryFilter) rowsQ = rowsQ.eq("category", categoryFilter)
    if (searchText.trim()) rowsQ = rowsQ.or(`vendor.ilike.${s},description.ilike.${s}`)
    if (range) rowsQ = rowsQ.gte("entry_date", range.start).lt("entry_date", range.end)
    const rowsP = rowsQ.order("entry_date", { ascending: false }).range(0, pageCount * PAGE_SIZE - 1)

    // 2) 요약 집계 (선택기간 전체 — 검색/구분/분류 무관한 '기간 개요'). 통화 분리 위해 currency 포함.
    let sumQ = supabase
      .from("finance_entries")
      .select("kind, category, total_amount, currency, entry_date")
      .is("deleted_at", null)
    if (range) sumQ = sumQ.gte("entry_date", range.start).lt("entry_date", range.end)

    // 3) 추세용 6개월 raw (ym 기준) — TrendBars + 전월대비 배지를 클라에서 재집계(쿼리 폭증 방지).
    let ty = ym.y
    let tm = ym.m - 5
    while (tm <= 0) {
      tm += 12
      ty -= 1
    }
    const trendStart = monthRange({ y: ty, m: tm }).start
    const trendEnd = monthRange(ym).end
    const trendQ = supabase
      .from("finance_entries")
      .select("kind, category, total_amount, currency, entry_date")
      .is("deleted_at", null)
      .gte("entry_date", trendStart)
      .lt("entry_date", trendEnd)

    // 4) 세금계산서 초안 (기간 무관 — issue_date nullable)
    const invQ = supabase.from("tax_invoices").select("*").order("created_at", { ascending: false })

    const [rowsRes, sumRes, trendRes, invRes] = await Promise.all([rowsP, sumQ, trendQ, invQ])
    setEntries(rowsRes.data ?? [])
    setTotalCount(rowsRes.count ?? 0)
    setInvoices(invRes.data ?? [])
    setSumRows((sumRes.data as SumRow[]) ?? [])
    setTrendRaw((trendRes.data as SumRow[]) ?? [])
    setLoading(false)
  }, [supabase, searchText, kindFilter, categoryFilter, pageCount, range, ym])

  useEffect(() => {
    load()
  }, [load])

  // 필터/검색/기간 변경 시 페이지 리셋
  useEffect(() => {
    setPageCount(1)
  }, [searchText, kindFilter, categoryFilter, range])

  // 환율 1회 로드(서버가 일별 캐시). 외부 데이터라 비동기 콜백에서만 setState.
  useEffect(() => {
    let alive = true
    fetch("/api/finance/fx-rates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && d.rates) setFx(d as { base: string; as_of: string | null; rates: Record<string, number> })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

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

  // 영수증 서명 URL(서버 인가 후) — 호버/클릭 공용.
  const receiptUrlFor = async (e: FinanceEntry): Promise<string | null> => {
    try {
      const res = await fetch("/api/finance/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: e.id }),
      })
      if (!res.ok) return null
      const { url } = (await res.json()) as { url: string }
      return url
    } catch {
      return null
    }
  }

  const viewReceipt = async (e: FinanceEntry) => {
    const url = await receiptUrlFor(e)
    if (!url) {
      toast.error("영수증을 열 수 없어요.")
      return
    }
    const ext = (e.receipt_url ?? "").split(".").pop()?.toLowerCase() ?? ""
    const mime =
      ext === "pdf"
        ? "application/pdf"
        : /^(png|jpe?g|gif|webp|bmp)$/.test(ext)
          ? `image/${ext === "jpg" ? "jpeg" : ext}`
          : null
    setReceiptPreview({ url, name: `${e.vendor ?? "영수증"} (${e.entry_date})`, mime })
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const exportCsv = async () => {
    // 현재 필터(검색/구분/분류) + 기간된 전체 행 (페이지네이션 무시, 휴지통 제외)
    let q = supabase.from("finance_entries").select("*").is("deleted_at", null)
    if (kindFilter !== "all") q = q.eq("kind", kindFilter)
    if (categoryFilter) q = q.eq("category", categoryFilter)
    if (searchText.trim()) {
      const s = `%${searchText.trim()}%`
      q = q.or(`vendor.ilike.${s},description.ilike.${s}`)
    }
    if (range) q = q.gte("entry_date", range.start).lt("entry_date", range.end)
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

  // ── 파생 집계(통화 분리) ──
  const byCurrency = useMemo(() => aggregateByCurrency(sumRows), [sumRows])
  const currencyRows = useMemo(
    () =>
      Object.entries(byCurrency).sort(([a, av], [b, bv]) => {
        if (a === "KRW") return -1
        if (b === "KRW") return 1
        return bv.revenue + bv.expense - (av.revenue + av.expense)
      }),
    [byCurrency],
  )
  // 전월대비(증감% 배지) — mode='month'일 때만 의미. trendRaw에서 prevMonth(ym) 버킷 집계.
  const prevByCurrency = useMemo(() => {
    const pr = monthRange(prevMonth(ym))
    return aggregateByCurrency(trendRaw.filter((r) => r.entry_date != null && r.entry_date >= pr.start && r.entry_date < pr.end))
  }, [trendRaw, ym])
  const showTrend = mode === "month"
  const expenseBreakdown = useMemo(() => toBreakdown(aggregateByCategory(sumRows, "expense")), [sumRows])
  const revenueBreakdown = useMemo(() => toBreakdown(aggregateByCategory(sumRows, "revenue")), [sumRows])

  // 원화 환산 합계 — fiat만 환율 적용(BTC 제외). usedFx=환산할 비-KRW 금액이 있을 때만 표시.
  const fxConverted = useMemo(() => {
    if (!fx) return null
    let revenue = 0
    let expense = 0
    let usedFx = false
    let skippedBtc = false
    for (const [cur, v] of Object.entries(byCurrency)) {
      if (cur === "BTC") {
        skippedBtc = true
        continue
      }
      const rate = cur === "KRW" ? 1 : fx.rates[cur]
      if (!rate || rate <= 0) continue
      if (cur !== "KRW") usedFx = true
      revenue += v.revenue * rate
      expense += v.expense * rate
    }
    return { revenue, expense, net: revenue - expense, usedFx, skippedBtc, asOf: fx.as_of }
  }, [fx, byCurrency])

  const trendCurrencies = useMemo(() => {
    const set = new Set<string>()
    for (const r of trendRaw) set.add(r.currency || "KRW")
    return [...set]
  }, [trendRaw])
  const effTrendCur = trendCurrencies.includes(trendCur) ? trendCur : trendCurrencies.includes("KRW") ? "KRW" : (trendCurrencies[0] ?? "KRW")
  const trendMonths = useMemo(() => buildMonthlyTrend(trendRaw, effTrendCur, ym), [trendRaw, effTrendCur, ym])

  const hasMore = entries.length < totalCount
  const allCategories = [...new Set([...EXPENSE_CATEGORIES, ...REVENUE_CATEGORIES])]

  const periodPresets: [PeriodMode, string, () => void][] = [
    ["month", "이번달", () => { setMode("month"); setYm(currentYM()) }],
    ["year", "올해", () => { setMode("year"); setYm(currentYM()) }],
    ["all", "전체", () => setMode("all")],
  ]
  const tabs: [Tab, string][] = [
    ["summary", "요약"],
    ["cashflow", "현금흐름"],
    ["ledger", "내역"],
    ["tax", "세금계산서"],
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* 헤더 — 모바일에선 버튼들이 제목 아래로 줄바꿈(제목 짜부 방지) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="shrink-0 text-lg font-semibold">비용·매출</h1>
        <div className="flex flex-wrap items-center gap-2">
          {tab === "ledger" && selected.size > 0 && (
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
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={totalCount === 0}>
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

      {/* 컨트롤 스트립: 기간 프리셋 + 월 스텝퍼 / 탭 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {periodPresets.map(([m, label, onClick]) => (
              <button
                key={m}
                onClick={onClick}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs transition-colors",
                  mode === m ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={cn("transition-opacity", mode === "month" ? "" : "opacity-40")}>
            <MonthStepper value={ym} onChange={(v) => { setYm(v); setMode("month") }} max={currentYM()} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          {tabs.map(([t, label]) => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                if (t !== "ledger") setSelected(new Set())
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                tab === t ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <Loading rows={6} />
      ) : tab === "cashflow" ? (
        <CashFlowView />
      ) : tab === "summary" ? (
        currencyRows.length === 0 ? (
          <EmptyState
            icon={Upload}
            title="이 기간 데이터가 없어요"
            description="기간을 바꾸거나 영수증 OCR·직접 입력으로 비용·매출을 기록하세요."
            action={mode !== "all" ? <Button size="sm" variant="outline" onClick={() => setMode("all")}>전체 보기</Button> : undefined}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {/* 원화 환산 합계 (전 통화→KRW, fiat만) */}
            {fxConverted?.usedFx && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
                  <span className="text-xs font-medium text-foreground">
                    원화 환산 합계 <span className="font-normal text-muted-foreground">(전 통화 → KRW)</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    기준환율 {fxConverted.asOf ?? "—"} · 참고{fxConverted.skippedBtc ? " · BTC 제외" : ""}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <SummaryCard label="총 매출" value={won(Math.round(fxConverted.revenue))} className="text-success" />
                  <SummaryCard label="총 지출" value={won(Math.round(fxConverted.expense))} className="text-destructive" />
                  <SummaryCard label="순수익" value={won(Math.round(fxConverted.net))} className={fxConverted.net >= 0 ? "text-foreground" : "text-destructive"} />
                </div>
              </div>
            )}

            {/* 통화별 KPI 카드 */}
            <div className="flex flex-col gap-3">
              {currencyRows.map(([cur, v]) => {
                const net = v.revenue - v.expense
                const prev = prevByCurrency[cur]
                const prevNet = prev ? prev.revenue - prev.expense : 0
                return (
                  <div key={cur} className="flex flex-col gap-1.5">
                    {currencyRows.length > 1 && (
                      <span className="text-xs font-medium text-muted-foreground">
                        {CURRENCIES.find((c) => c.code === cur)?.label ?? cur}
                      </span>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      <SummaryCard
                        label="총 매출"
                        value={money(v.revenue, cur)}
                        className="text-success"
                        trend={showTrend && prev ? <TrendBadge curr={v.revenue} prev={prev.revenue} /> : undefined}
                      />
                      <SummaryCard
                        label="총 지출"
                        value={money(v.expense, cur)}
                        className="text-destructive"
                        trend={showTrend && prev ? <TrendBadge curr={v.expense} prev={prev.expense} invert /> : undefined}
                      />
                      <SummaryCard
                        label="순수익"
                        value={money(net, cur)}
                        className={net >= 0 ? "text-foreground" : "text-destructive"}
                        trend={showTrend && prev ? <TrendBadge curr={net} prev={prevNet} /> : undefined}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 월간 추세 */}
            <div className="rounded-lg border p-4">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  월간 추세 <span className="font-normal text-muted-foreground">· 최근 6개월</span>
                </h2>
                {trendCurrencies.length > 1 && (
                  <div className="flex items-center gap-1">
                    {trendCurrencies.map((c) => (
                      <button
                        key={c}
                        onClick={() => setTrendCur(c)}
                        className={cn(
                          "rounded px-2 py-0.5 text-xs",
                          effTrendCur === c ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted/50",
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                {CURRENCIES.find((c) => c.code === effTrendCur)?.label ?? effTrendCur} 기준 · <span className="text-success">매출</span> / <span className="text-destructive">지출</span>
              </p>
              <TrendBars months={trendMonths} format={(n) => money(n, effTrendCur)} />
            </div>

            {/* 분류 분해 2열 (KRW) */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <h2 className="mb-3 text-sm font-semibold">
                  지출 분류 <span className="font-normal text-muted-foreground">· 원화(KRW) 기준</span>
                </h2>
                <BreakdownBars items={expenseBreakdown} format={won} />
              </div>
              <div className="rounded-lg border p-4">
                <h2 className="mb-3 text-sm font-semibold">
                  매출 채널 <span className="font-normal text-muted-foreground">· 원화(KRW) 기준</span>
                </h2>
                <BreakdownBars items={revenueBreakdown} format={won} />
              </div>
            </div>
          </div>
        )
      ) : tab === "ledger" ? (
        <div className="flex flex-col gap-4">
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
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">총 {totalCount.toLocaleString()}건</span>
          </div>

          {entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
              <Upload className="size-8" />
              <p className="text-sm">이 조건에 해당하는 내역이 없어요.</p>
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
                            <HoverPreview getUrl={() => receiptUrlFor(e)} name={e.receipt_url} className="shrink-0">
                              <button
                                onClick={() => viewReceipt(e)}
                                title="첨부 영수증 보기 (호버로 미리보기)"
                                className="text-muted-foreground transition-colors hover:text-primary"
                              >
                                <Receipt className="size-3.5" />
                              </button>
                            </HoverPreview>
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
        </div>
      ) : (
        /* 세금계산서 탭 */
        invoices.length === 0 ? (
          <EmptyState icon={FileText} title="세금계산서 초안이 없어요" description="내역 탭에서 항목을 선택해 초안을 만들 수 있어요." />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">전체 초안 (기간 무관)</p>
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
        )
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

      {receiptPreview && (
        <FilePreview url={receiptPreview.url} name={receiptPreview.name} mime={receiptPreview.mime} onClose={() => setReceiptPreview(null)} />
      )}
    </div>
  )
}
