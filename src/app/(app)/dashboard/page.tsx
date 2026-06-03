import { DashboardAssistant } from "@/components/dashboard/DashboardAssistant"

export default function DashboardPage() {
  return (
    <div className="relative flex min-h-[calc(100vh-7rem)] flex-col items-center justify-center overflow-hidden">
      {/* 배경 오라 — 은은하게 움직이는 빛 무리 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="animate-aura absolute left-1/2 top-[18%] size-[460px] -translate-x-1/2 rounded-full bg-primary/10 blur-[90px]" />
        <div
          className="animate-aura absolute left-[28%] top-[55%] size-[340px] rounded-full bg-chart-1/15 blur-[90px]"
          style={{ animationDelay: "2.5s" }}
        />
        <div
          className="animate-aura absolute right-[24%] top-[30%] size-[300px] rounded-full bg-chart-4/15 blur-[90px]"
          style={{ animationDelay: "5s" }}
        />
      </div>

      <div className="animate-fade-up w-full">
        <DashboardAssistant />
      </div>
    </div>
  )
}
