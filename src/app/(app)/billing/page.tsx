import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { CheckoutView } from "@/components/billing/CheckoutView"
import { isBillingConfigured, isRecurringEnabled } from "@/app/api/billing/checkout/route"
import { getUserWorkspaceId } from "@/lib/workspace"

// 결제 시작 화면. 사이드바 메뉴에는 넣지 않는다 — 결제는 설정 > 요금제에서 들어오는 흐름이고,
// 상시 노출하면 부담스럽다(lib/config/features.ts는 건드리지 않음).
//
// PG 자격증명 유무는 **서버에서만** 판정해 넘긴다. 클라이언트에 키를 내려보내지 않기 위함이다.
export const runtime = "nodejs"

export default async function BillingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let currentPlan: string | null = null
  if (user) {
    const admin = createAdminClient()
    // ⚠️ "가장 오래된 멤버십"이 아니라 **지금 보고 있는 활성 워크스페이스**를 써야 한다.
    //    checkout·해지 라우트는 이미 이 방식으로 고쳐졌는데(여러 회사 소속 오너가 B사 화면에서
    //    A사가 결제되던 실제 사고), 이 페이지의 "현재 요금제" 표시 로직만 안 옮겨져 있었다
    //    (대표 지적 2026-08-26 — 다른 회사 플랜이 "현재 요금제"로 뜰 수 있었다).
    const wsId = await getUserWorkspaceId(admin, user.id)
    if (wsId) {
      const { data: ws } = await admin.from("workspaces").select("plan").eq("id", wsId).maybeSingle()
      currentPlan = ws?.plan ?? null
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">요금제 결제</h1>
        <p className="text-sm text-muted-foreground">회사 단위로 결제합니다. 표시 금액은 부가세 포함이에요.</p>
      </div>
      <CheckoutView
        currentPlan={currentPlan}
        billingConfigured={isBillingConfigured()}
        recurringEnabled={isRecurringEnabled()}
      />
    </div>
  )
}
