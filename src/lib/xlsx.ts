// 손익 → 함수가 살아있는 엑셀(.xlsx). exceljs는 클릭 시에만 lazy import(SSR/번들 격리).
// 셀에 실제 수식을 넣어 열어서 숫자를 바꾸면 자동 재계산된다.

export type PnlRow = {
  name: string
  kindLabel: string // "매출" | "비용" | "보유금" (SUMIF 매칭용)
  typeLabel: string // "정액" | "수량" | "채널"
  item_type: "fixed" | "qty" | "channel"
  units: number
  unit_price: number
  rate: number // 0–1
  extra: number
  amount: number // 정액일 때만 사용(계산형은 수식 셀)
  currency: string
}

/**
 * 컬럼: A 항목명 · B 구분 · C 유형 · D 판매수/갯수 · E 단가 · F 수수료% · G 택배비/부가세 · H 금액(수식) · I 통화
 *  - channel: H = D*(E*(1−F)−G)
 *  - qty:     H = D*E + G
 *  - fixed:   H = 입력 금액(값)
 *  하단: 총매출 = SUMIF(B,"매출",H) · 총비용 = SUMIF(B,"비용",H) · 순이익 = 총매출 − 총비용
 */
export async function downloadPnlXlsx(filename: string, rows: PnlRow[]) {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("손익")

  ws.columns = [
    { header: "항목명", width: 22 },
    { header: "구분", width: 8 },
    { header: "유형", width: 8 },
    { header: "판매수/갯수", width: 12 },
    { header: "단가", width: 12 },
    { header: "수수료%", width: 9 },
    { header: "택배비/부가세", width: 13 },
    { header: "금액", width: 16 },
    { header: "통화", width: 7 },
  ]
  const head = ws.getRow(1)
  head.font = { bold: true }
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F7" } }
    c.alignment = { vertical: "middle" }
  })

  rows.forEach((r, i) => {
    const rn = i + 2
    ws.addRow([
      r.name,
      r.kindLabel,
      r.typeLabel,
      r.item_type === "fixed" ? null : r.units || 0,
      r.item_type === "fixed" ? null : r.unit_price || 0,
      r.item_type === "channel" ? r.rate || 0 : null,
      r.item_type === "fixed" ? null : r.extra || 0,
      null,
      r.currency,
    ])
    const h = ws.getCell(`H${rn}`)
    if (r.item_type === "channel") h.value = { formula: `D${rn}*(E${rn}*(1-F${rn})-G${rn})` }
    else if (r.item_type === "qty") h.value = { formula: `D${rn}*E${rn}+G${rn}` }
    else h.value = r.amount
    ws.getCell(`F${rn}`).numFmt = "0.00%"
    for (const col of ["D", "E", "G", "H"]) ws.getCell(`${col}${rn}`).numFmt = "#,##0"
  })

  const last = rows.length + 1 // 마지막 데이터 행
  const base = last + 2
  const totals: [string, string][] = [
    ["총매출", `SUMIF(B2:B${last},"매출",H2:H${last})`],
    ["총비용", `SUMIF(B2:B${last},"비용",H2:H${last})`],
    ["순이익", `H${base}-H${base + 1}`],
  ]
  totals.forEach(([label, formula], k) => {
    const rn = base + k
    ws.getCell(`A${rn}`).value = label
    ws.getCell(`A${rn}`).font = { bold: true }
    const h = ws.getCell(`H${rn}`)
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
