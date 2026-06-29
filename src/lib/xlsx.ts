// 손익 → 함수가 살아있는 엑셀(.xlsx). exceljs는 클릭 시에만 lazy import(SSR/번들 격리).
// 행마다 입력 필드를 D열부터 배치하고, 금액 셀에 그 행 유형의 AST에서 만든 실제 수식을 넣는다(앱과 동일 결과).
// 가독성: 구분별 정렬·행 배경색·테두리·헤더 고정·총계 강조.

import { toExcelFormula, type CalcNode, type CalcField } from "./calcFormula"

export type PnlRow = {
  name: string
  kindLabel: string // "매출" | "비용" | "보유금" (SUMIF 매칭·색)
  typeLabel: string
  fields: CalcField[] // 순서대로 D,E,F… 배치
  values: Record<string, number>
  ast: CalcNode | null // null = 정액(값)
  amount: number // 정액일 때
  currency: string
}

const INPUT_COLS = ["D", "E", "F", "G", "H", "I"]
const AMT = "J"
const NCOLS = 11 // A..K
const KIND_ORDER: Record<string, number> = { 매출: 0, 보유금: 1, 비용: 2 }
const THIN = { style: "thin" as const, color: { argb: "FFDCE0E6" } }
const ALL_BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const rowFill = (kind: string): string | null =>
  kind === "매출" ? "FFEAF7EF" : kind === "비용" ? "FFFCECEE" : kind === "보유금" ? "FFEAF1FE" : null

export async function downloadPnlXlsx(filename: string, rows: PnlRow[]) {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("손익", { views: [{ state: "frozen", ySplit: 1 }] })

  ws.columns = [
    { header: "항목명", width: 24 },
    { header: "구분", width: 8 },
    { header: "유형", width: 16 },
    { header: "입력1", width: 11 },
    { header: "입력2", width: 11 },
    { header: "입력3", width: 11 },
    { header: "입력4", width: 11 },
    { header: "입력5", width: 11 },
    { header: "입력6", width: 11 },
    { header: "금액", width: 16 },
    { header: "통화", width: 7 },
  ]
  const head = ws.getRow(1)
  head.font = { bold: true }
  head.alignment = { vertical: "middle" }
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } }
    c.font = { bold: true, color: { argb: "FFFFFFFF" } }
  })

  // 구분별 정렬(매출→보유→비용)
  const sorted = [...rows].sort((a, b) => (KIND_ORDER[a.kindLabel] ?? 9) - (KIND_ORDER[b.kindLabel] ?? 9))

  sorted.forEach((r, i) => {
    const rn = i + 2
    ws.getCell(`A${rn}`).value = r.name
    ws.getCell(`B${rn}`).value = r.kindLabel
    ws.getCell(`C${rn}`).value = r.typeLabel
    const colOf: Record<string, string> = {}
    r.fields.slice(0, INPUT_COLS.length).forEach((fld, k) => {
      const col = INPUT_COLS[k]
      colOf[fld.key] = col
      const cell = ws.getCell(`${col}${rn}`)
      cell.value = Number(r.values[fld.key] ?? 0)
      cell.numFmt = fld.kind === "percent" ? "0.00%" : "#,##0"
    })
    const amt = ws.getCell(`${AMT}${rn}`)
    amt.value = r.ast ? { formula: `IFERROR(${toExcelFormula(r.ast, colOf, rn)},0)` } : r.amount
    amt.numFmt = "#,##0"
    amt.font = { bold: true }
    ws.getCell(`K${rn}`).value = r.currency
    // 구분 색
    const fg = rowFill(r.kindLabel)
    if (fg) for (let c = 1; c <= NCOLS; c++) ws.getRow(rn).getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fg } }
  })

  const last = sorted.length + 1 // 마지막 데이터 행
  const base = last + 2 // 총매출 행
  const totals: [string, string][] = [
    ["총매출", `SUMIF(B2:B${last},"매출",${AMT}2:${AMT}${last})`],
    ["총비용", `SUMIF(B2:B${last},"비용",${AMT}2:${AMT}${last})`],
    ["순이익", `${AMT}${base}-${AMT}${base + 1}`],
  ]
  totals.forEach(([label, formula], k) => {
    const rn = base + k
    ws.getCell(`A${rn}`).value = label
    const h = ws.getCell(`${AMT}${rn}`)
    h.value = sorted.length ? { formula } : 0
    h.numFmt = "#,##0"
    for (let c = 1; c <= NCOLS; c++) {
      const cell = ws.getRow(rn).getCell(c)
      cell.font = { bold: true }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }
    }
  })

  // 테두리(헤더+데이터 / 총계) — 사이 빈 행 제외
  const border = (from: number, to: number) => {
    for (let rr = from; rr <= to; rr++) for (let c = 1; c <= NCOLS; c++) ws.getRow(rr).getCell(c).border = ALL_BORDER
  }
  border(1, last)
  border(base, base + 2)
  // 총계 상단 굵은 선(데이터와 구분)
  const medium = { style: "medium" as const, color: { argb: "FF94A3B8" } }
  for (let c = 1; c <= NCOLS; c++) ws.getRow(base).getCell(c).border = { ...ALL_BORDER, top: medium }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
