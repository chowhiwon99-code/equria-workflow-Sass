import Link from "next/link"
import { FEATURES } from "@/lib/config/features"
import { DashboardAssistant } from "@/components/dashboard/DashboardAssistant"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function DashboardPage() {
  const features = FEATURES.filter((f) => f.href !== "/dashboard")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">대시보드</h1>
        <p className="text-sm text-muted-foreground">
          이큐리아 워크스페이스에 오신 것을 환영합니다.
        </p>
      </div>

      {/* 메인 — 범용 Claude 어시스턴트 */}
      <div className="rounded-2xl border bg-gradient-to-b from-muted/40 to-transparent p-5 sm:p-8">
        <DashboardAssistant />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon
          return (
            <Link key={feature.href} href={feature.href} className="hover-grow block">
              <Card className="h-full transition-colors hover:border-foreground/20 hover:bg-accent/40">
                <CardHeader>
                  <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-5" />
                  </div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {feature.label}
                    {feature.status === "planned" && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                        예정
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
