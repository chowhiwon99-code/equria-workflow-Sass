import { AnnouncementsBoard } from "@/components/dashboard/AnnouncementsBoard"
import { TodayTasks } from "@/components/dashboard/TodayTasks"
import { DashboardAssistant } from "@/components/dashboard/DashboardAssistant"
import { Surface } from "@/components/shared/Surface"

export default function DashboardPage() {
  // 상단 공지사항·오늘 할 일(shrink-0) + 나머지 높이를 어시스턴트가 채운다.
  return (
    <div className="flex h-[var(--app-content-height)] flex-col gap-3">
      <AnnouncementsBoard />
      <TodayTasks />
      <Surface variant="glass" padding="none" className="min-h-0 flex-1 overflow-hidden rounded-xl">
        <DashboardAssistant />
      </Surface>
    </div>
  )
}
