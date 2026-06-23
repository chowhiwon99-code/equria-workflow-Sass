"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * 부드러운 원형 선택 체크 — 네이티브 체크박스(쨍한 흰색) 대신.
 * 미선택: hover 시 살짝 나타나는 반투명 원. 선택: primary 채움 + 체크. 라이트/다크 자동.
 * 부모에 `group`이 있어야 hover 노출이 동작한다.
 */
export function SelectCheck({
  checked,
  onToggle,
  className,
}: {
  checked: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label="선택"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border shadow-sm transition-all duration-150",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-foreground/20 bg-background/70 text-transparent opacity-0 backdrop-blur-sm group-hover:opacity-100 hover:border-foreground/40",
        className
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </button>
  )
}
