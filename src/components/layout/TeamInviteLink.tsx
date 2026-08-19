"use client"

// 사이드바 '팀 초대' — 골든패스 1단계(팀원 초대)로 가는 상시 진입로.
// 지금까지 초대는 설정 페이지 깊숙이에만 있어서, 오너가 좌석이 몇 개 남았는지 모른 채
// 링크를 뿌리고 → 초대받은 사람이 참여 화면에서 "자리가 없다"를 처음 알게 됐다.
// 잔여 좌석을 발급 전에, 오너 화면에서 먼저 보여준다.
//
// 오너에게만 보인다 — 설정의 '구성원 초대' 카드가 오너에게만 렌더되므로(SettingsView),
// 그보다 넓게 열면 눌러도 아무것도 없는 링크가 된다.
// 좌석이 꽉 차면 색으로만 알린다. 상시 업그레이드 배너는 만들지 않는다(대표 결정).

import Link from "next/link"
import { UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/components/workspace/WorkspaceProvider"
import { useSeats } from "@/hooks/useSeats"
import { planOf, seatsFull } from "@/lib/plans"

export function TeamInviteLink() {
  const { currentWorkspace } = useWorkspace()
  const { plan, used, loading } = useSeats()

  if (currentWorkspace?.role !== "owner") return null

  const seats = planOf(plan).seats
  const full = seatsFull(plan, used)

  return (
    <Link
      href="/settings#invite"
      className="flex items-center gap-2 border-t px-3 py-2.5 transition-colors hover:bg-sidebar-accent/50"
    >
      <UserPlus className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-[11px] font-medium text-muted-foreground">팀 초대</span>
      {!loading && (
        <span className={cn("text-[11px] tabular-nums", full ? "font-semibold text-amber-600" : "text-muted-foreground")}>
          {seats != null ? `${used}/${seats}명` : `${used}명`}
        </span>
      )}
    </Link>
  )
}
