import { ApprovalView } from "@/components/approval/ApprovalView"
import { PlanGate } from "@/components/shared/PlanGate"

export default function ApprovalPage() {
  return (
    <PlanGate>
      <ApprovalView />
    </PlanGate>
  )
}
