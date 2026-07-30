import { AnnouncementsBoard } from "@/components/dashboard/AnnouncementsBoard"
import { TodayTasks } from "@/components/dashboard/TodayTasks"
import { DashboardAssistant } from "@/components/dashboard/DashboardAssistant"
import { FinanceSnapshot } from "@/components/dashboard/FinanceSnapshot"
import { Surface } from "@/components/shared/Surface"

export default function DashboardPage() {
  // 세션41 랜딩 목업 정합: 공지 → 손익 필 → (오늘 할 일 | 최근 기록) 2열 → 어시스턴트(고정 높이 축소).
  // FinanceSnapshot이 노출 게이팅(게스트/설정)을 스스로 판단 — 숨김이면 오늘 할 일만 전폭 렌더.
  // min-h(고정 h 아님): 카드+어시스턴트가 뷰포트를 넘으면 자연 스크롤.
  return (
    <div className="flex min-h-[var(--app-content-height)] flex-col gap-3">
      <AnnouncementsBoard />
      <FinanceSnapshot today={<TodayTasks />} />
      <Surface padding="none" className="h-[26rem] shrink-0 overflow-hidden rounded-xl">
        <DashboardAssistant />
      </Surface>
    </div>
  )
}
