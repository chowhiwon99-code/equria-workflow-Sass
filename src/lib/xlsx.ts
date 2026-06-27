// 손익 → 함수가 살아있는 엑셀(.xlsx). exceljs는 클릭 시에만 lazy import(SSR/번들 격리).
// 행마다 입력 필드를 D열부터 배치하고, 금액 셀에 그 행 유형의 AST에서 만든 실제 수식을 넣는다(앱과 동일 결과).

import { toExcelFormula, type CalcNode, type CalcField } from "./calcFormula"

export type PnlRow = {
  name: string
  kindLabel: string // "매출" | "비용" | "보유금" (SUMIF 매칭)
  typeLabel: string
  fields: CalcField[] // 순서대로 D,E,F… 배치
  values: Record<string, number>
  ast: CalcNode | null // null = 정액(값)
  amount: number // 정액일 때
  currency: string
}

const INPUT_COLS = ["D", "E", "F", "G", "H", "I"] // 입력 최대 6칸
const AMT = "J"

export async function downloadPnlXlsx(filename: string, rows: PnlRow[]) {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("손익")

  ws.columns = [
    { header: "항목명", width: 22 },
    { header: "구분", width: 8 },
    { header: "유형", width: 14 },
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
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F7" } }
  })

  rows.forEach((r, i) => {
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
    ws.getCell(`K${rn}`).value = r.currency
  })

  const last = rows.length + 1
  const base = last + 2
  const totals: [string, string][] = [
    ["총매출", `SUMIF(B2:B${last},"매출",${AMT}2:${AMT}${last})`],
    ["총비용", `SUMIF(B2:B${last},"비용",${AMT}2:${AMT}${last})`],
    ["순이익", `${AMT}${base}-${AMT}${base + 1}`],
  ]
  totals.forEach(([label, formula], k) => {
    const rn = base + k
    ws.getCell(`A${rn}`).value = label
    ws.getCell(`A${rn}`).font = { bold: true }
    const h = ws.getCell(`${AMT}${rn}`)
    h.value = rows.length ? { formula } : 0
    h.font = { bold: true }
    h.numFmt = "#,##0"
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
