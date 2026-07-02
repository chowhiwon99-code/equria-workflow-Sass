// 손익 → 함수가 살아있는 엑셀(.xlsx). exceljs는 클릭 시에만 lazy import(SSR/번들 격리).
// 전문가 계층표: 상단 요약박스 → 구분(매출/비용/보유금) > 그룹 > 항목 3단계 + 단계별 소계 + 총계.
// 금액 셀은 행 유형 AST에서 만든 실제 수식(앱과 동일). 엑셀 네이티브 아웃라인(+/−)으로 2단계 접기.

import { toExcelFormula, type CalcNode, type CalcField } from "./calcFormula"
import type { CashSummary } from "./cashflowGraph"

export type PnlRow = {
  name: string
  group: string | null // 그룹 이름(없으면 null)
  kindLabel: string // "매출" | "비용" | "보유금" (SUMIF 매칭·색)
  typeLabel: string
  fields: CalcField[]
  values: Record<string, number>
  ast: CalcNode | null // null = 정액(값)
  amount: number
  currency: string
}

const THIN = { style: "thin" as const, color: { argb: "FFDCE0E6" } }
const ALL_BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const rowFill = (kind: string): string | null =>
  kind === "매출" ? "FFEAF7EF" : kind === "비용" ? "FFFCECEE" : kind === "보유금" ? "FFEAF1FE" : null
// 구분(kind) 최상위 섹션 밴드색 / 구분 소계 진한 색조.
const KIND_BAND: Record<string, string> = { 매출: "FFB7E4C7", 비용: "FFF5B7BD", 보유금: "FFB8D0F5" }
const KIND_TINT: Record<string, string> = { 매출: "FFD5EFDE", 비용: "FFF7D6DA", 보유금: "FFD5E3FA" }
const KINDS = ["매출", "비용", "보유금"] as const
const DARK = "FF1F2937"
// 1-indexed 컬럼 번호 → 엑셀 문자(A,B,…,Z,AA…). 계산 칸(필드) 수 무제한 지원.
const colLetter = (n: number): string => {
  let s = ""
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// rows는 그룹 순서대로 정렬되어 옴. xlsx는 구분(kind)으로 재버킷 → 구분>그룹>항목 계층으로 렌더.
export async function downloadPnlXlsx(filename: string, rows: PnlRow[], summary: CashSummary[]) {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("손익")
  // 구분 소계=레벨0, 그룹 헤더·소계=레벨1, 항목=레벨2 → 좌측 +/−로 항목→그룹, 그룹→구분 2단계 접기.
  ws.properties.outlineLevelRow = 2
  ws.properties.outlineProperties = { summaryBelow: true, summaryRight: false }

  // 계산 칸(필드) 수에 맞춰 입력 컬럼 동적 배치.
  const maxFields = Math.max(0, ...rows.map((r) => r.fields.length))
  const INPUT_COLS = Array.from({ length: maxFields }, (_, i) => colLetter(4 + i))
  const AMT = colLetter(4 + maxFields)
  const CUR = colLetter(5 + maxFields)
  const NCOLS = 5 + maxFields
  const LAST = colLetter(NCOLS)
  // 폭만 설정(header 넣으면 엑셀이 row1에 표 헤더를 써서 요약박스 제목을 덮음 → 표 헤더는 HEADER_ROW에 수동 작성).
  ws.columns = [{ width: 26 }, { width: 9 }, { width: 16 }, ...INPUT_COLS.map(() => ({ width: 11 })), { width: 16 }, { width: 8 }]

  const fillRow = (rn: number, argb: string) => {
    for (let c = 1; c <= NCOLS; c++) ws.getRow(rn).getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb } }
  }
  const setLevel = (rn: number, level: number) => {
    ws.getRow(rn).outlineLevel = level
  }

  // ── 상단 요약박스 (running rn — 박스 높이가 아래 수식 오프셋과 절대 어긋나지 않게) ──
  ws.mergeCells(`A1:${LAST}1`)
  const title = ws.getCell("A1")
  title.value = "손익 요약"
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } }
  title.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 13 }
  title.alignment = { vertical: "middle" }
  let rn = 2
  const boxMetric = (label: string, value: number, emphasize = false) => {
    ws.getCell(`A${rn}`).value = label
    ws.getCell(`A${rn}`).font = { bold: emphasize }
    ws.mergeCells(`C${rn}:${AMT}${rn}`)
    const v = ws.getCell(`C${rn}`)
    v.value = Number(value)
    v.numFmt = "#,##0"
    v.alignment = { horizontal: "right" }
    if (emphasize) v.font = { bold: true, size: 12, color: { argb: value < 0 ? "FFB91C1C" : "FF166534" } }
    fillRow(rn, "FFF8FAFC")
    for (let c = 1; c <= NCOLS; c++) ws.getRow(rn).getCell(c).border = ALL_BORDER
    rn++
  }
  for (const s of summary) {
    boxMetric(`가용현금 (${s.currency})`, s.available, true)
    boxMetric(`순이익 (${s.currency})`, s.netProfit, true)
    boxMetric(`총매출 (${s.currency})`, s.revenue)
    boxMetric(`총비용 (${s.currency})`, s.expense)
  }
  rn++ // 박스↔표 사이 빈 줄(데이터 구역 밖 → 아웃라인 무관)

  // ── 표 헤더(수동) ──
  const HEADER_ROW = rn
  const headers = ["항목명", "구분", "유형", ...INPUT_COLS.map((_, i) => `입력${i + 1}`), "금액", "통화"]
  headers.forEach((h, i) => {
    const cell = ws.getRow(HEADER_ROW).getCell(i + 1)
    cell.value = h
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } }
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.alignment = { vertical: "middle" }
  })
  rn = HEADER_ROW + 1
  const rn0 = rn // 첫 데이터 행

  const writeItem = (r: PnlRow, rnItem: number) => {
    ws.getCell(`A${rnItem}`).value = r.name
    ws.getCell(`A${rnItem}`).alignment = { indent: 2 }
    ws.getCell(`B${rnItem}`).value = r.kindLabel // 항목 행만 B=kindLabel → 구분/총계 SUMIF 매칭 근거
    ws.getCell(`C${rnItem}`).value = r.typeLabel
    const colOf: Record<string, string> = {}
    r.fields.forEach((fld, k) => {
      const col = INPUT_COLS[k]
      if (!col) return
      colOf[fld.key] = col
      const cell = ws.getCell(`${col}${rnItem}`)
      cell.value = Number(r.values[fld.key] ?? 0)
      cell.numFmt = fld.kind === "percent" ? "0.00%" : "#,##0"
    })
    const amt = ws.getCell(`${AMT}${rnItem}`)
    amt.value = r.ast ? { formula: `IFERROR(${toExcelFormula(r.ast, colOf, rnItem)},0)` } : r.amount
    amt.numFmt = "#,##0"
    amt.font = { bold: true }
    ws.getCell(`${CUR}${rnItem}`).value = r.currency
    const fg = rowFill(r.kindLabel)
    if (fg) fillRow(rnItem, fg)
  }
  const bandRow = (label: string, argb: string, indent: number) => {
    ws.getCell(`A${rn}`).value = label
    ws.getCell(`A${rn}`).font = { bold: true }
    ws.getCell(`A${rn}`).alignment = { indent }
    fillRow(rn, argb) // 헤더/소계 행은 B를 비워둠(SUMIF 이중집계 방지)
  }
  const subtotalRow = (label: string, formula: string, argb: string, indent: number) => {
    ws.getCell(`A${rn}`).value = label
    ws.getCell(`A${rn}`).font = { bold: true }
    ws.getCell(`A${rn}`).alignment = { indent }
    const h = ws.getCell(`${AMT}${rn}`)
    h.value = { formula }
    h.numFmt = "#,##0"
    h.font = { bold: true }
    fillRow(rn, argb)
  }

  const groupOrder: string[] = []
  for (const r of rows) if (r.group && !groupOrder.includes(r.group)) groupOrder.push(r.group)

  // ── 구분 > 그룹 > 항목 ──
  for (const kind of KINDS) {
    const kindRows = rows.filter((r) => r.kindLabel === kind)
    if (kindRows.length === 0) continue
    bandRow(`▾ ${kind}`, KIND_BAND[kind], 0)
    setLevel(rn, 0)
    rn++
    const kStart = rn
    // 그룹 블록(연속·동일 kind → 소계는 단순 SUM). 혼합 kind 그룹은 매출·비용 섹션에 각각 나뉘어 표시(부호 일관).
    const emitGroupBlock = (gname: string, items: PnlRow[], headerFill: string) => {
      bandRow(`▾ ${gname}`, headerFill, 1)
      setLevel(rn, 1)
      rn++
      const gStart = rn
      for (const it of items) {
        writeItem(it, rn)
        setLevel(rn, 2)
        rn++
      }
      subtotalRow(`${gname} 소계`, `SUM(${AMT}${gStart}:${AMT}${rn - 1})`, "FFF1F5F9", 1)
      setLevel(rn, 1)
      rn++
    }
    for (const gname of groupOrder) {
      const gItems = kindRows.filter((r) => r.group === gname)
      if (gItems.length > 0) emitGroupBlock(gname, gItems, "FFE5E9F0")
    }
    const uItems = kindRows.filter((r) => r.group == null)
    if (uItems.length > 0) emitGroupBlock("기타", uItems, "FFEEF1F5")
    const kEnd = rn - 1
    subtotalRow(`${kind} 소계`, `SUMIF(B${kStart}:B${kEnd},"${kind}",${AMT}${kStart}:${AMT}${kEnd})`, KIND_TINT[kind], 0)
    setLevel(rn, 0)
    rn++
  }
  const lastData = rn - 1

  // ── 총계 블록(빈 줄 뒤) ──
  const OPENING = summary.reduce((a, s) => a + s.opening, 0)
  const Brange = `B${rn0}:B${lastData}`
  const AMTrange = `${AMT}${rn0}:${AMT}${lastData}`
  rn++ // 빈 줄
  const base = rn
  const totals: [string, string][] = [
    ["총매출", `SUMIF(${Brange},"매출",${AMTrange})`],
    ["총비용", `SUMIF(${Brange},"비용",${AMTrange})`],
    ["순이익", `${AMT}${base}-${AMT}${base + 1}`],
    ["가용현금", `${OPENING}+${AMT}${base + 2}-SUMIF(${Brange},"보유금",${AMTrange})`],
  ]
  totals.forEach(([label, formula], k) => {
    const r = base + k
    ws.getCell(`A${r}`).value = label
    const h = ws.getCell(`${AMT}${r}`)
    h.value = rows.length ? { formula } : 0
    h.numFmt = "#,##0"
    for (let c = 1; c <= NCOLS; c++) ws.getRow(r).getCell(c).font = { bold: true }
    fillRow(r, "FFF1F5F9")
    setLevel(r, 0)
  })

  // ── 테두리 + 프리즈 ──
  const border = (from: number, to: number) => {
    for (let r = from; r <= to; r++) for (let c = 1; c <= NCOLS; c++) ws.getRow(r).getCell(c).border = ALL_BORDER
  }
  border(HEADER_ROW, lastData)
  border(base, base + 3)
  const medium = { style: "medium" as const, color: { argb: "FF94A3B8" } }
  for (let c = 1; c <= NCOLS; c++) ws.getRow(base).getCell(c).border = { ...ALL_BORDER, top: medium }
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }] // 박스+표 헤더 고정(박스 만든 뒤 설정)

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
