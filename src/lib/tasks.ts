/** 할 일(오늘 할 일·프로젝트 체크리스트) 공용 유틸 — 날짜/기한 라벨. */

/** 오늘 날짜 YYYY-MM-DD (로컬 타임존) */
export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** 기한(due_date, YYYY-MM-DD) → 짧은 배지 라벨 + 기한 지남 여부 */
export function dueBadge(due: string): { text: string; overdue: boolean } {
  const today = todayStr()
  const overdue = due < today
  const text = due === today ? "오늘" : due.slice(5).replace("-", ".")
  return { text, overdue }
}
