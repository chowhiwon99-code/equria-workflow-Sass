"use client"

import { cn } from "@/lib/utils"
import { Select } from "@/components/shared/Select"

/**
 * 다중 선택 시 화면을 밀지 않고 부드럽게 떠오르는 하단 플로팅 바.
 * 항상 렌더(애니메이션용) — 선택 0이면 아래로 살짝 내려가며 fade-out + 클릭 차단.
 * 파일·회의노트 공용. 이동 드롭다운은 Radix라 공간 없으면 자동으로 위로 펼침.
 */
export function SelectionBar({
  count,
  moveOptions,
  onMove,
  onClear,
}: {
  count: number
  moveOptions: { value: string; label: string }[]
  onMove: (folderId: string | null) => void
  onClear: () => void
}) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4 transition-all duration-200 ease-out",
        count > 0 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-full border bg-background/90 px-4 py-2 text-sm shadow-[var(--shadow-lg)] backdrop-blur-md",
          count > 0 ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <span className="font-medium">{count}개 선택</span>
        <Select
          value=""
          placeholder="폴더로 이동…"
          onChange={(v) => onMove(v === "none" ? null : v)}
          options={moveOptions}
          align="start"
          className="h-8"
        />
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground">
          선택 해제
        </button>
      </div>
    </div>
  )
}
