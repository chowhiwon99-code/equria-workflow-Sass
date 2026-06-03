"use client"

import { cn } from "@/lib/utils"

export const MANUAL_STATUSES = [
  { value: "active", label: "활동중", color: "bg-green-500" },
  { value: "meeting", label: "회의중", color: "bg-purple-500" },
  { value: "remote", label: "원격근무", color: "bg-sky-500" },
  { value: "vacation", label: "휴가중", color: "bg-amber-500" },
  { value: "dnd", label: "방해금지", color: "bg-rose-500" },
] as const

const COLOR: Record<string, string> = Object.fromEntries(MANUAL_STATUSES.map((s) => [s.value, s.color]))
const LABEL: Record<string, string> = Object.fromEntries(MANUAL_STATUSES.map((s) => [s.value, s.label]))

export function statusLabel(online: boolean, manual?: string | null): string {
  if (manual && manual !== "active" && LABEL[manual]) return LABEL[manual]
  return online ? "온라인" : "오프라인"
}

/**
 * 아바타 우하단 상태점. 수동상태(휴가/회의 등)가 우선, 없으면 presence(온/오프).
 * online = Realtime Presence 집합 포함 여부, manual = profiles.status_manual.
 */
export function StatusDot({
  online,
  manual,
  className,
}: {
  online: boolean
  manual?: string | null
  className?: string
}) {
  const color =
    manual && manual !== "active" && COLOR[manual]
      ? COLOR[manual]
      : online
        ? "bg-green-500"
        : "bg-muted-foreground/40"
  const label = statusLabel(online, manual)
  return (
    <span
      className={cn("block size-2.5 rounded-full ring-2 ring-background", color, className)}
      title={label}
      aria-label={label}
    />
  )
}
