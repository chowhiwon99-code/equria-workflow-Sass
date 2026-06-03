import type { ReactNode } from "react"
import { AlertTriangle, RefreshCw, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * 공용 상태 컴포넌트 — 모든 화면의 로딩/빈/에러 표시를 일관되게.
 * 로딩은 스켈레톤(깜빡임 박멸), 에러는 재시도 버튼 제공(무한 로딩·조용한 실패 방지).
 */

/** 스켈레톤 로딩 — bare "불러오는 중…" 텍스트 대체. rows로 줄 수 조절. */
export function Loading({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/60" />
      ))}
      <span className="sr-only">불러오는 중…</span>
    </div>
  )
}

/** 빈 상태 — 데이터가 없을 때. 아이콘·제목·설명·CTA(선택). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground",
        className
      )}
    >
      {Icon && <Icon className="size-8" />}
      <p className="text-sm">{title}</p>
      {description && <p className="max-w-xs text-xs text-muted-foreground/70">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

/** 에러 상태 — 조회 실패 시. onRetry 주면 "다시 시도" 버튼 노출. */
export function ErrorState({
  message = "불러오지 못했어요.",
  onRetry,
  className,
}: {
  message?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center",
        className
      )}
    >
      <AlertTriangle className="size-7 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
        >
          <RefreshCw className="size-3.5" /> 다시 시도
        </button>
      )}
    </div>
  )
}
