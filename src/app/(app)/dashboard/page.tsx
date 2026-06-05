import { DashboardAssistant } from "@/components/dashboard/DashboardAssistant"

export default function DashboardPage() {
  // 헤더(약 56px) + main 패딩(상하 48px) 제외한 높이로 채팅 워크스페이스를 채운다.
  return (
    <div className="h-[var(--app-content-height)] overflow-hidden rounded-xl border bg-card/30">
      <DashboardAssistant />
    </div>
  )
}
