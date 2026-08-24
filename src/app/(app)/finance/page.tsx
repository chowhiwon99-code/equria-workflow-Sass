import { FinanceView } from "@/components/finance/FinanceView"
import { PlanGate } from "@/components/shared/PlanGate"

export default function FinancePage() {
  return (
    <PlanGate>
      <FinanceView />
    </PlanGate>
  )
}
