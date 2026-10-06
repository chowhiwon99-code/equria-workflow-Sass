"use client"

import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2, Upload } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { Modal } from "@/components/shared/Modal"
import { Select } from "@/components/shared/Select"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { won, EXPENSE_CATEGORIES, REVENUE_CATEGORIES } from "@/lib/finance"
import { readBankFile, BankFileError } from "@/lib/bankFile"
import {
  COLUMN_LABELS,
  EMPTY_MAP,
  detectHeader,
  fingerprintKeys,
  hashKey,
  isUsableMap,
  parseRows,
  suggestCategory,
  vendorKey,
  type BankTxn,
  type ColumnField,
  type ColumnMap,
} from "@/lib/bankImport"

type ReviewRow = BankTxn & { fp: string; dup: boolean; include: boolean; category: string }

const MAP_FIELDS: ColumnField[] = ["date", "description", "deposit", "withdraw", "amount", "direction", "balance", "memo", "time"]

/**
 * 통장 거래내역 가져오기 — 파일 선택 → (열 자동 감지, 실패 시 수동 지정) → 미리보기에서 분류 확인 → 장부 저장.
 * 이미 가져온 거래는 지문(import_fp)으로 표시·제외하고, DB 유니크 제약이 최종 방어선이다(마이그159).
 */
export function BankImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const supabase = createClient()
  const me = useCurrentUserId()
  const wsId = useCurrentWorkspaceId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState("")
  const [table, setTable] = useState<string[][] | null>(null)
  const [headerRow, setHeaderRow] = useState(0)
  const [map, setMap] = useState<ColumnMap>(EMPTY_MAP)
  const [step, setStep] = useState<"pick" | "map" | "review">("pick")
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [skipped, setSkipped] = useState(0)

  const buildReview = async (tbl: string[][], hr: number, m: ColumnMap) => {
    const { txns, skipped: sk } = parseRows(tbl, hr, m)
    if (txns.length === 0) {
      toast.error("거래를 한 건도 읽지 못했어요. 열 지정을 확인해주세요.")
      setStep("map")
      return
    }
    const fps = await Promise.all(fingerprintKeys(txns).map(hashKey))
    // 이미 가져온 지문
    const existing = new Set<string>()
    for (let i = 0; i < fps.length; i += 200) {
      const { data } = await supabase.from("finance_entries").select("import_fp").in("import_fp", fps.slice(i, i + 200))
      for (const r of data ?? []) if (r.import_fp) existing.add(r.import_fp)
    }
    // 거래처별 과거 분류(최근 것이 이김) — 두 번째 달부터 분류가 거의 자동이 된다.
    const { data: past } = await supabase
      .from("finance_entries")
      .select("kind, vendor, category, created_at")
      .is("deleted_at", null)
      .not("vendor", "is", null)
      .not("category", "is", null)
      .order("created_at", { ascending: true })
      .limit(2000)
    const history = new Map<string, string>()
    for (const p of past ?? []) {
      history.set(`${p.kind === "revenue" ? "in" : "out"}:${vendorKey(p.vendor as string)}`, p.category as string)
    }
    setRows(
      txns.map((t, i) => {
        const dup = existing.has(fps[i])
        return { ...t, fp: fps[i], dup, include: !dup, category: suggestCategory(t, history) }
      }),
    )
    setSkipped(sk)
    setStep("review")
  }

  const onFile = async (file: File) => {
    setBusy(true)
    setFileName(file.name)
    try {
      const tbl = await readBankFile(file)
      setTable(tbl)
      const det = detectHeader(tbl)
      if (det) {
        setHeaderRow(det.headerRow)
        setMap(det.map)
        await buildReview(tbl, det.headerRow, det.map)
      } else {
        setHeaderRow(0)
        setMap(EMPTY_MAP)
        setStep("map")
        toast.message("열을 자동으로 찾지 못했어요. 머리행과 열을 직접 골라주세요.")
      }
    } catch (e) {
      toast.error(e instanceof BankFileError ? e.message : "파일을 읽지 못했어요.")
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const colOptions = useMemo(
    () => [
      { value: "", label: "없음" },
      ...(table?.[headerRow] ?? []).map((h, i) => ({ value: String(i), label: `${i + 1}열 · ${h || "(빈 칸)"}` })),
    ],
    [table, headerRow],
  )

  const picked = rows.filter((r) => r.include)
  const sumIn = picked.filter((r) => r.direction === "in").reduce((s, r) => s + r.amount, 0)
  const sumOut = picked.filter((r) => r.direction === "out").reduce((s, r) => s + r.amount, 0)
  const dupCount = rows.filter((r) => r.dup).length

  const patch = (fp: string, p: Partial<ReviewRow>) => setRows((prev) => prev.map((r) => (r.fp === fp ? { ...r, ...p } : r)))

  const save = async () => {
    if (!wsId || picked.length === 0) return
    setBusy(true)
    try {
      const payload = picked.map((r) => ({
        workspace_id: wsId,
        kind: r.direction === "in" ? "revenue" : "expense",
        entry_date: r.date,
        vendor: r.description,
        description: r.memo,
        amount: r.amount,
        tax_amount: 0,
        fee_amount: 0,
        total_amount: r.amount,
        category: r.category,
        currency: "KRW",
        source: "bank",
        status: "confirmed",
        import_fp: r.fp,
        created_by: me,
        metadata: { bank: { time: r.time, balance: r.balance, file: fileName } },
      }))
      let inserted = 0
      for (let i = 0; i < payload.length; i += 200) {
        const { data, error } = await supabase
          .from("finance_entries")
          .upsert(payload.slice(i, i + 200), { onConflict: "workspace_id,import_fp", ignoreDuplicates: true })
          .select("id")
        if (error) throw new Error(error.message)
        inserted += data?.length ?? 0
      }
      const skippedDup = picked.length - inserted
      toast.success(`${inserted}건을 장부에 넣었어요.${skippedDup > 0 ? ` (이미 있던 ${skippedDup}건 제외)` : ""}`)
      onImported()
    } catch (e) {
      toast.error(e instanceof Error ? `저장에 실패했어요: ${e.message}` : "저장에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="통장 거래내역 가져오기" onClose={onClose} className="max-w-3xl">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,.txt"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />

      {step === "pick" && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            인터넷뱅킹·은행 앱에서 받은 거래내역 파일(엑셀·CSV)을 올려주세요.
            <br />
            어느 은행이든 열을 자동으로 찾아 입금은 매출, 출금은 비용으로 정리해요.
          </p>
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {busy ? "읽는 중…" : "파일 선택"}
          </Button>
        </div>
      )}

      {step === "map" && table && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {fileName} — 제목(머리)이 있는 줄과 각 열을 골라주세요. 날짜·내용과, 입금/출금 또는 거래금액 중 하나는 꼭 필요해요.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <span className="w-28 shrink-0 text-muted-foreground">머리행</span>
            <Select
              value={String(headerRow)}
              onChange={(v) => {
                setHeaderRow(Number(v))
                setMap(EMPTY_MAP)
              }}
              options={table.slice(0, 40).map((r, i) => ({
                value: String(i),
                label: `${i + 1}행 · ${r.filter(Boolean).slice(0, 4).join(" | ") || "(빈 줄)"}`,
              }))}
              className="min-w-0 flex-1"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {MAP_FIELDS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm">
                <span className="w-28 shrink-0 text-muted-foreground">{COLUMN_LABELS[f]}</span>
                <Select
                  value={map[f] == null ? "" : String(map[f])}
                  onChange={(v) => setMap((m) => ({ ...m, [f]: v === "" ? null : Number(v) }))}
                  options={colOptions}
                  className="min-w-0 flex-1"
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              다른 파일
            </Button>
            <Button size="sm" disabled={!isUsableMap(map) || busy} onClick={() => void buildReview(table, headerRow, map)}>
              미리보기
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>
              선택 <b>{picked.length}</b>건
            </span>
            <span className="text-emerald-600 dark:text-emerald-400">입금 {won(sumIn)}</span>
            <span className="text-rose-600 dark:text-rose-400">출금 {won(sumOut)}</span>
            {dupCount > 0 && <span className="text-muted-foreground">이미 가져온 {dupCount}건 제외</span>}
            {skipped > 0 && <span className="text-muted-foreground">읽지 않은 줄 {skipped}개(합계·안내 등)</span>}
            <button type="button" onClick={() => setStep("map")} className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline">
              열 다시 지정
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            내 계좌끼리 옮긴 돈(이체)처럼 장부에 넣지 않을 거래는 체크를 해제하세요. 분류는 한 번 정해두면 다음부터 같은 거래처에 자동으로 붙어요.
          </p>
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="w-8 p-2">
                    <input
                      type="checkbox"
                      aria-label="전체 선택"
                      checked={rows.length > 0 && rows.every((r) => r.include || r.dup)}
                      onChange={(e) => setRows((prev) => prev.map((r) => (r.dup ? r : { ...r, include: e.target.checked })))}
                    />
                  </th>
                  <th className="p-2 text-left font-medium">날짜</th>
                  <th className="p-2 text-left font-medium">내용</th>
                  <th className="p-2 text-right font-medium">금액</th>
                  <th className="p-2 text-left font-medium">분류</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.fp} className={cn("border-b last:border-0", (!r.include || r.dup) && "opacity-50")}>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${r.description} 포함`}
                        checked={r.include}
                        disabled={r.dup}
                        onChange={(e) => patch(r.fp, { include: e.target.checked })}
                      />
                    </td>
                    <td className="whitespace-nowrap p-2 tabular-nums">{r.date.slice(5)}</td>
                    <td className="max-w-[16rem] p-2">
                      <div className="truncate">{r.description}</div>
                      {(r.memo || r.dup) && (
                        <div className="truncate text-xs text-muted-foreground">{r.dup ? "이미 가져옴" : r.memo}</div>
                      )}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap p-2 text-right tabular-nums",
                        r.direction === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {r.direction === "in" ? "+" : "−"}
                      {r.amount.toLocaleString()}
                    </td>
                    <td className="p-2">
                      <Select
                        value={r.category}
                        onChange={(v) => patch(r.fp, { category: v })}
                        options={[...(r.direction === "in" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES)].map((c) => ({ value: c, label: c }))}
                        className="h-7 w-32 text-xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              다른 파일
            </Button>
            <Button size="sm" onClick={save} disabled={busy || picked.length === 0}>
              {busy && <Loader2 className="animate-spin" />}
              {picked.length}건 장부에 넣기
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
