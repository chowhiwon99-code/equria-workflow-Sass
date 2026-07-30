import { AnnouncementsBoard } from "@/components/dashboard/AnnouncementsBoard"
import { TodayTasks } from "@/components/dashboard/TodayTasks"
import { TaskSuggestions } from "@/components/dashboard/TaskSuggestions"
import { WorkOverview } from "@/components/dashboard/WorkOverview"
import { AssistantPanel } from "@/components/dashboard/AssistantPanel"

export default function DashboardPage() {
  // 세션41 대표 확정 레이아웃: 공지 → [오늘 할 일 | AI 작업 제안] → [진행 중 | 예정] → 어시스턴트(높이 드래그).
  // 손익 필·최근 기록은 제거(재무 탭에서), min-h라 내용이 넘치면 자연 스크롤.
  return (
    <div className="flex min-h-[var(--app-content-height)] flex-col gap-3">
      <AnnouncementsBoard />
      <div className="grid shrink-0 gap-3 lg:grid-cols-2">
        <TodayTasks />
        <TaskSuggestions />
      </div>
      <WorkOverview />
      <AssistantPanel />
    </div>
  )
}
