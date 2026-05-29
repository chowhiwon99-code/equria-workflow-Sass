/**
 * 간단한 CSV 생성·다운로드 유틸 — 외부 라이브러리 없이.
 * Excel/Numbers에서 바로 열림 (UTF-8 BOM 포함, RFC 4180 escape).
 */

type Cell = string | number | null | undefined

function escape(v: Cell): string {
  const s = v == null ? "" : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 헤더 + 행 배열을 CSV 문자열로 변환 */
export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n")
}

/** 파일명으로 CSV 다운로드 (BOM 포함) */
export function downloadCsv(filename: string, headers: string[], rows: Cell[][]) {
  const csv = "﻿" + toCsv(headers, rows) // BOM → Excel 한글 인코딩 자동 감지
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 파일명용 타임스탬프 (YYYYMMDD) */
export function todayStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
}
