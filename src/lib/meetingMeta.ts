// 회의 메타데이터 공용 헬퍼 — 중요도(고정 등급) + 분류 색. 나중에 프로젝트/작업도 재사용.

export const IMPORTANCE = [
  { value: 0, label: "없음" },
  { value: 1, label: "낮음" },
  { value: 2, label: "보통" },
  { value: 3, label: "높음" },
  { value: 4, label: "긴급" },
] as const

export function importanceLabel(v: number): string {
  return IMPORTANCE.find((i) => i.value === v)?.label ?? "없음"
}

/** 중요도 색(없음=muted, 낮음=blue, 보통=gray, 높음=orange, 긴급=red). */
export function importanceColor(v: number): string {
  return ["gray", "blue", "gray", "orange", "red"][v] ?? "gray"
}

export const CATEGORY_COLORS = ["gray", "red", "orange", "yellow", "green", "blue", "purple"] as const
export type CategoryColor = (typeof CATEGORY_COLORS)[number]

const COLOR_OKLCH: Record<string, string> = {
  gray: "oklch(0.6 0.02 264)",
  red: "oklch(0.62 0.2 25)",
  orange: "oklch(0.7 0.16 60)",
  yellow: "oklch(0.8 0.14 95)",
  green: "oklch(0.65 0.16 150)",
  blue: "oklch(0.6 0.13 240)",
  purple: "oklch(0.55 0.16 300)",
}

/** 태그/배지 배경 — color-mix 투명이라 라이트·다크 자동. 텍스트는 foreground 상속. */
export function tagBg(color: string, pct = 26): string {
  const c = COLOR_OKLCH[color] ?? COLOR_OKLCH.gray
  return `color-mix(in oklch, ${c} ${pct}%, transparent)`
}

/** 스와치(진한 미리보기) — 카테고리 색 선택 UI용. */
export function swatch(color: string): string {
  return COLOR_OKLCH[color] ?? COLOR_OKLCH.gray
}
