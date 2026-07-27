"use client"

import { cn } from "@/lib/utils"
import { fieldClass } from "@/components/shared/Modal"

/**
 * 공용 날짜 입력 — 빈 값일 때 네이티브 "연도. 월. 일." 노출을 가린다(대표 지시: 날짜 UI 정리).
 * 값 없음: 네이티브 텍스트를 투명 처리하고 placeholder("날짜 선택") 오버레이.
 * 포커스: 오버레이를 숨기고 세그먼트 편집(연/월/일) 원복 — 키보드 입력 그대로.
 * className은 래퍼 폭 지정용(w-full·w-36 등), 입력 자체는 fieldClass 표준.
 */
export function DateInput({
  value,
  onChange,
  className,
  min,
  max,
  title,
  placeholder = "날짜 선택",
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  min?: string
  max?: string
  title?: string
  placeholder?: string
}) {
  return (
    <span className={cn("relative inline-block", className)}>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        title={title}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          fieldClass,
          "peer [color-scheme:light] dark:[color-scheme:dark]",
          !value && "text-transparent focus:text-foreground"
        )}
      />
      {!value && (
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground peer-focus:hidden">
          {placeholder}
        </span>
      )}
    </span>
  )
}
