"use client"

// 사이드바 하단 — 지금 이 회사가 쓰는 요금제. 결제 전에는 설정 > 결제 탭까지 들어가야만
// 보였다(대표 지적 2026-08-26) — 상시 보이는 자리가 없었다.
// ⚠️ 순수 정보 표시만 한다(업그레이드 CTA 없음) — TeamInviteLink·billing/page.tsx 주석에 이미
// "상시 업그레이드 배너는 만들지 않는다"·"결제를 상시 노출하면 부담스럽다"는 대표 결정이 있다.
// 업그레이드 유도는 실제로 막히는 순간(PlanGate·크레딧 소진)에만 하고, 여기선 안내만 한다.
import { planOf } from "@/lib/plans"
import { useSeats } from "@/hooks/useSeats"

export function PlanBadge() {
  const { plan, loading } = useSeats()
  if (loading) return null

  return (
    <div className="flex items-center gap-1.5 border-t px-3 py-2">
      <span className="text-[11px] text-muted-foreground">요금제</span>
      <span className="text-[11px] font-semibold">{planOf(plan).label}</span>
    </div>
  )
}
