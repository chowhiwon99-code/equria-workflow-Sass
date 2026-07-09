"use client"

import { FileText, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/States"
import { DOC_STATUS_BADGE } from "./status"
import { docSummary } from "./templates"
import { isMyTurn, type Doc } from "./lib"

export function DocumentList({
  docs,
  me,
  nameById,
  posById,
  emptyLabel,
  onOpen,
  onNew,
}: {
  docs: Doc[]
  me: string
  nameById: Record<string, string>
  posById: Record<string, string | null>
  emptyLabel: string
  onOpen: (id: string) => void
  onNew?: () => void
}) {
  if (docs.length === 0)
    return (
      <EmptyState
        icon={FileText}
        title={emptyLabel}
        description={onNew ? "‘새 기안’으로 결재 문서를 만들어 상신해보세요." : undefined}
        action={
          onNew ? (
            <Button size="sm" variant="outline" onClick={onNew}>
              <Plus className="size-3.5" /> 새 기안 작성
            </Button>
          ) : undefined
        }
      />
    )
  return (
    <div className="flex flex-col divide-y rounded-xl border">
      {docs.map((d) => (
        <button
          key={d.id}
          onClick={() => onOpen(d.id)}
          className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{d.doc_type}</span>
              <span className="truncate text-sm font-medium">{d.title || "(제목 없음)"}</span>
              {isMyTurn(d, me) && (
                <span className="shrink-0 rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-white">내 차례</span>
              )}
            </div>
            <span className="truncate text-[11px] text-muted-foreground">
              {d.doc_no ? `${d.doc_no} · ` : ""}
              {[nameById[d.drafter_id] ?? "직원", posById[d.drafter_id]].filter(Boolean).join(" · ")} ·{" "}
              {docSummary(d.doc_type, (d.body ?? {}) as Record<string, unknown>)}
            </span>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {(d.submitted_at ?? d.created_at).slice(5, 10).replace("-", ".")}
          </span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", DOC_STATUS_BADGE[d.status])}>
            {d.status}
          </span>
        </button>
      ))}
    </div>
  )
}
