"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowUpCircle } from "lucide-react"
import { findFeatureByPath } from "@/lib/config/features"
import { usePlanGate } from "@/hooks/usePlanGate"
import { planOf } from "@/lib/plans"
import { Loading } from "./States"

/**
 * 요금제 미달이면 페이지 내용 대신 업그레이드 카드를 보여준다(InviteLinksCard 시트 게이팅과 같은 톤).
 * 현재 경로를 FEATURES(lib/config/features.ts)의 minPlan과 대조 — GuestGuard와 같은 방식.
 * ⚠️ 화면 안내용이다. 실제 강제는 각 테이블의 BEFORE INSERT 트리거(마이그143)가 한다.
 */
export function PlanGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const minPlan = findFeatureByPath(pathname)?.minPlan
  const { allowed, loading } = usePlanGate(minPlan ?? "free")

  if (!minPlan) return <>{children}</>
  if (loading) return <Loading className="p-6" />
  if (!allowed) {
    const feature = findFeatureByPath(pathname)
    const minPlanDef = planOf(minPlan)
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <ArrowUpCircle className="size-8 text-primary" />
          <p className="text-lg font-semibold">{feature?.label ?? "이 기능"}은 {minPlanDef.label} 요금제부터 사용할 수 있어요.</p>
          <p className="text-sm text-muted-foreground">지금 요금제를 올리면 바로 이용할 수 있어요.</p>
          <Link
            href="/#pricing"
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <ArrowUpCircle className="size-4" /> 요금제 보기
          </Link>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
