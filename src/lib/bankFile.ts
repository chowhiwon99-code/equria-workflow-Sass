/**
 * 통장 거래내역 파일 → 2차원 문자열 표. 브라우저 전용(DOMParser·TextDecoder).
 * 은행 "엑셀 저장"은 형식이 제각각이다:
 *  - .xlsx(진짜 엑셀)           → exceljs(이미 의존성, 클릭 시 lazy import)
 *  - .xls인데 속은 HTML 표       → 국내 은행에 흔하다 → DOMParser로 가장 큰 표
 *  - .csv / .txt                → UTF-8 또는 EUC-KR(CP949) 자동 판별, 쉼표/탭 구분
 *  - 진짜 구형 .xls(BIFF 바이너리) → 새 의존성 없이 못 읽음 → "xlsx로 다시 저장" 안내
 * 순수 파싱(열 감지·거래 변환)은 bankImport.ts.
 */

export class BankFileError extends Error {}

const pad = (n: number) => String(n).padStart(2, "0")

/** exceljs 셀 값 → 문자열. 날짜는 시트에 적힌 벽시계 시각 그대로(UTC 게터 — exceljs가 naive 시각을 UTC로 담는다). */
function cellToString(v: unknown): string {
  if (v == null) return ""
  if (v instanceof Date) {
    const t = `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}${t === "00:00:00" ? "" : ` ${t}`}`
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (typeof v === "string") return v
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: unknown; result?: unknown }
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("")
    if (o.result !== undefined) return cellToString(o.result)
    if (o.text !== undefined) return cellToString(o.text)
  }
  return String(v)
}

async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buf)
  } catch {
    throw new BankFileError("엑셀 파일을 열 수 없어요. 암호가 걸려 있다면 암호를 해제해 저장한 뒤 올려주세요.")
  }
  // 거래내역은 보통 첫 시트지만, 안내 시트가 앞에 있는 은행도 있어 행이 가장 많은 시트를 쓴다.
  let best: string[][] = []
  wb.eachSheet((ws) => {
    const rows: string[][] = []
    ws.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cellToString(cell.value).trim()
      })
      rows.push(Array.from(cells, (c) => c ?? ""))
    })
    if (rows.length > best.length) best = rows
  })
  return best
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "")
  } catch {
    return new TextDecoder("euc-kr").decode(bytes)
  }
}

function readHtmlTable(html: string): string[][] {
  const doc = new DOMParser().parseFromString(html, "text/html")
  let best: string[][] = []
  doc.querySelectorAll("table").forEach((table) => {
    const rows: string[][] = []
    table.querySelectorAll("tr").forEach((tr) => {
      rows.push(Array.from(tr.querySelectorAll("th,td"), (c) => (c.textContent ?? "").replace(/\s+/g, " ").trim()))
    })
    if (rows.length > best.length) best = rows
  })
  return best
}

/** 따옴표를 지키는 최소 CSV 파서. 구분자는 첫 줄에서 탭/쉼표 중 많은 쪽. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  const delim = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ","
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) {
      row.push(field.trim())
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(field.trim())
      rows.push(row)
      row = []
      field = ""
    } else field += ch
  }
  if (field || row.length) {
    row.push(field.trim())
    rows.push(row)
  }
  return rows
}

export async function readBankFile(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const sig = Array.from(bytes.slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("")
  if (sig === "504b0304") return readXlsx(buf) // zip = xlsx
  if (sig === "d0cf11e0") {
    throw new BankFileError(
      "옛날 엑셀(.xls) 형식이에요. 엑셀에서 열어 ‘다른 이름으로 저장 → Excel 통합 문서(.xlsx)’로 저장한 뒤 올려주세요.",
    )
  }
  const text = decodeText(bytes)
  if (/<table[\s>]/i.test(text)) return readHtmlTable(text)
  return parseCsv(text)
}
