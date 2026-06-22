"use client"

import { useState, type ReactNode } from "react"
import { Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * 폴더 사이드바 한 줄 — 클릭=선택, (폴더만) hover 시 삭제, 드래그한 항목 드롭 대상.
 * 회의노트·파일 폴더 정리에서 공용으로 쓴다.
 */
export function FolderSidebarItem({
  label,
  count,
  active,
  icon,
  onClick,
  onDelete,
  onDropItem,
}: {
  label: string
  count: number
  active: boolean
  icon?: ReactNode
  onClick: () => void
  onDelete?: () => void
  onDropItem?: (id: string) => void
}) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={onDropItem ? (e) => { e.preventDefault(); setOver(true) } : undefined}
      onDragLeave={onDropItem ? () => setOver(false) : undefined}
      onDrop={
        onDropItem
          ? (e) => {
              e.preventDefault()
              setOver(false)
              const id = e.dataTransfer.getData("text/plain")
              if (id) onDropItem(id)
            }
          : undefined
      }
      className={cn(
        "group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
        over
          ? "bg-primary/10 ring-2 ring-inset ring-primary"
          : active
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted/50"
      )}
    >
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        {icon}
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          aria-label={`${label} 삭제`}
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  )
}
