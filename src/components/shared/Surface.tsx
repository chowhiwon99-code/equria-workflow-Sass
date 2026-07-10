import * as React from "react"
import { cn } from "@/lib/utils"

type SurfaceVariant = "solid" | "glass"
type SurfacePad = "none" | "sm" | "md"

/**
 * 공용 표면(섹션 카드) 프리미티브 — 앱 전체에 복붙돼 있던 카드 관용구를 한 곳으로.
 * - variant="solid": 기존 `border bg-card shadow-[var(--shadow-sm)]`를 그대로 재현(픽셀 중립 이관용).
 * - variant="glass": globals.css의 `.glass`(반투명+블러+시트, 폴백 포함) 적용.
 * cn()으로 합성 → 호출부가 className으로 계속 오버라이드 가능(rounded-xl·패딩 등).
 */
const variantClass: Record<SurfaceVariant, string> = {
  solid: "border bg-card shadow-[var(--shadow-sm)]",
  glass: "glass",
}
const padClass: Record<SurfacePad, string> = { none: "", sm: "p-4", md: "p-5" }

export function Surface({
  variant = "solid",
  padding = "md",
  className,
  ...props
}: React.ComponentProps<"div"> & { variant?: SurfaceVariant; padding?: SurfacePad }) {
  return (
    <div
      data-slot="surface"
      className={cn("rounded-2xl", variantClass[variant], padClass[padding], className)}
      {...props}
    />
  )
}
