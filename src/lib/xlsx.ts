// 손익 → 함수가 살아있는 엑셀(.xlsx). exceljs는 클릭 시에만 lazy import(SSR/번들 격리).
// 그룹별 섹션(이름 행 + 항목 + 소계) + 총계. 금액 셀은 행 유형 AST에서 만든 실제 수식(앱과 동일).
// 가독성: 행 배경색·테두리·헤더 고정.

import { toExcelFormula, type CalcNode, type CalcField } from "./calcFormula"

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

// rows는 그룹 순서대로 정렬되어 옴(그룹 항목들 → 미그룹). 그룹이 바뀌면 섹션 헤더/소계 삽입.
export async function downloadPnlXlsx(filename: string, rows: PnlRow[]) {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("손익", { views: [{ state: "frozen", ySplit: 1 }] })
  // 계산 칸(필드) 수에 맞춰 입력 컬럼을 동적 배치 — 6칸 초과해도 잘리지 않게(엑셀 수식 정확).
  const maxFields = Math.max(0, ...rows.map((r) => r.fields.length))
  const INPUT_COLS = Array.from({ length: maxFields }, (_, i) => colLetter(4 + i))
  const AMT = colLetter(4 + maxFields)
  const CUR = colLetter(5 + maxFields)
  const NCOLS = 5 + maxFields
  ws.columns = [
    { header: "항목명", width: 24 },
    { header: "구분", width: 8 },
    { header: "유형", width: 16 },
    ...INPUT_COLS.map((_, i) => ({ header: `입력${i + 1}`, width: 11 })),
    { header: "금액", width: 16 },
    { header: "통화", width: 7 },
  ]
  const head = ws.getRow(1)
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } }
    c.font = { bold: true, color: { argb: "FFFFFFFF" } }
    c.alignment = { vertical: "middle" }
  })

  const fillRow = (rn: number, argb: string) => {
    for (let c = 1; c <= NCOLS; c++) ws.getRow(rn).getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb } }
  }
  const writeItem = (r: PnlRow, rn: number) => {
    ws.getCell(`A${rn}`).value = r.name
    ws.getCell(`B${rn}`).value = r.kindLabel
    ws.getCell(`C${rn}`).value = r.typeLabel
    const colOf: Record<string, string> = {}
    r.fields.forEach((fld, k) => {
      const col = INPUT_COLS[k]
      if (!col) return
      colOf[fld.key] = col
      const cell = ws.getCell(`${col}${rn}`)
      cell.value = Number(r.values[fld.key] ?? 0)
      cell.numFmt = fld.kind === "percent" ? "0.00%" : "#,##0"
    })
    const amt = ws.getCell(`${AMT}${rn}`)
    amt.value = r.ast ? { formula: `IFERROR(${toExcelFormula(r.ast, colOf, rn)},0)` } : r.amount
    amt.numFmt = "#,##0"
    amt.font = { bold: true }
    ws.getCell(`${CUR}${rn}`).value = r.currency
    const fg = rowFill(r.kindLabel)
    if (fg) fillRow(rn, fg)
  }

  let rn = 2
  let curGroup: string | null | undefined = undefined
  let groupStart = 0
  const flushSubtotal = () => {
    if (curGroup && groupStart > 0 && rn > groupStart) {
      ws.getCell(`A${rn}`).value = `${curGroup} 소계`
      ws.getCell(`A${rn}`).font = { bold: true }
      const h = ws.getCell(`${AMT}${rn}`)
      // 표의 그룹 소계(순=매출−비용−보유)와 동일하게 — 단순 SUM(부호 무시)이 아니라 구분별 부호 적용.
      const gs = groupStart
      const ge = rn - 1
      h.value = { formula: `SUMIF(B${gs}:B${ge},"매출",${AMT}${gs}:${AMT}${ge})-SUMIF(B${gs}:B${ge},"비용",${AMT}${gs}:${AMT}${ge})-SUMIF(B${gs}:B${ge},"보유금",${AMT}${gs}:${AMT}${ge})` }
      h.numFmt = "#,##0"
      h.font = { bold: true }
      fillRow(rn, "FFF1F5F9")
      rn++
    }
  }
  for (const r of rows) {
    if (r.group !== curGroup) {
      flushSubtotal()
      curGroup = r.group
      if (curGroup) {
        ws.getCell(`A${rn}`).value = `▸ ${curGroup}`
        ws.getCell(`A${rn}`).font = { bold: true }
        fillRow(rn, "FFE5E9F0")
        rn++
      }
      groupStart = rn
    }
    writeItem(r, rn)
    rn++
  }
  flushSubtotal()

  const lastData = rn - 1 // 항목/섹션 마지막 행
  const base = rn + 1 // 총계 시작(한 줄 띄움)
  const totals: [string, string][] = [
    ["총매출", `SUMIF(B2:B${lastData},"매출",${AMT}2:${AMT}${lastData})`],
    ["총비용", `SUMIF(B2:B${lastData},"비용",${AMT}2:${AMT}${lastData})`],
    ["순이익", `${AMT}${base}-${AMT}${base + 1}`],
  ]
  totals.forEach(([label, formula], k) => {
    const r = base + k
    ws.getCell(`A${r}`).value = label
    const h = ws.getCell(`${AMT}${r}`)
    h.value = rows.length ? { formula } : 0
    h.numFmt = "#,##0"
    for (let c = 1; c <= NCOLS; c++) ws.getRow(r).getCell(c).font = { bold: true }
    fillRow(r, "FFF1F5F9")
  })

  const border = (from: number, to: number) => {
    for (let r = from; r <= to; r++) for (let c = 1; c <= NCOLS; c++) ws.getRow(r).getCell(c).border = ALL_BORDER
  }
  border(1, lastData)
  border(base, base + 2)
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
