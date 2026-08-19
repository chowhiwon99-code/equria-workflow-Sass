"use client"

// 좌석 게이지 — "요금제 · 구성원 n/m명 + 막대".
// InviteLinksCard 안에만 있던 블록을 그대로 뽑았다(모양 무변경). 오너가 링크를 만들기 *전에*,
// 그리고 사이드바에서도 같은 숫자를 보게 하려고 공용화했다.
// ⚠️ 가격·정원 로직은 여기서 정하지 않는다 — lib/plans.ts(planOf·seatsFull)가 SSOT.

import { Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { planOf, seatsFull } from "@/lib/plans"

export function SeatMeter({ plan, used, className }: { plan: string; used: number; className?: string }) {
  const planDef = planOf(plan)
  const full = seatsFull(plan, used)

  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <Users className="size-3.5" />
      <span className="font-medium text-foreground">{planDef.label} 요금제</span>
      <span className="tabular-nums">
        구성원 {used}
        {planDef.seats != null ? ` / ${planDef.seats}명` : " (무제한)"}
      </span>
      {planDef.seats != null && (
        <span className="ml-1 flex-1">
          <span className="inline-block h-1.5 w-24 max-w-full overflow-hidden rounded-full bg-muted align-middle">
            <span
              className={cn("block h-full rounded-full", full ? "bg-rose-500" : "bg-primary")}
              style={{ width: `${Math.min(100, (used / planDef.seats) * 100)}%` }}
            />
          </span>
        </span>
      )}
    </div>
  )
}
