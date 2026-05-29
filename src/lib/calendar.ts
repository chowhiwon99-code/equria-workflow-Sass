/**
 * 캘린더 날짜 계산 유틸 — 외부 라이브러리 없이 네이티브 `Date`만 사용.
 * (FullCalendar/date-fns 미사용 — React 19 호환 이슈 및 의존성 최소화)
 */

export const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const

/** 두 날짜가 같은 '일'(로컬 기준)인지 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** 로컬 기준 YYYY-MM-DD 문자열 (input[type=date] 값과 호환) */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** 로컬 기준 HH:mm 문자열 (input[type=time] 값과 호환) */
export function toTimeInputValue(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0")
  const min = String(date.getMinutes()).padStart(2, "0")
  return `${h}:${min}`
}

/** "2026년 5월" 형태 라벨 */
export function monthLabel(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`
}

/** 해당 월을 보여주는 6주(42칸) 날짜 배열. 일요일 시작, 앞뒤 달 패딩 포함. */
export function buildMonthGrid(viewDate: Date): Date[] {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  // 그리드 시작 = 1일이 속한 주의 일요일
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay())
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i))
  }
  return cells
}

/** 해당 월의 이벤트 조회 범위 [start, end) — timestamptz 쿼리용 ISO 문자열 */
export function monthQueryRange(viewDate: Date): { startIso: string; endIso: string } {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  // 그리드가 앞뒤 달 일부를 포함하므로 넉넉히 ±1주 여유
  const start = new Date(year, month, 1 - 7)
  const end = new Date(year, month + 1, 1 + 7)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

/** 이전/다음 달 Date (1일 기준) */
export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

/** 날짜(YYYY-MM-DD) + 시간(HH:mm)을 로컬 기준 Date로 합쳐 ISO 반환. 시간 없으면 00:00. */
export function combineDateTimeToIso(dateStr: string, timeStr?: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number)
  return new Date(y, m - 1, d, hh || 0, mm || 0).toISOString()
}
