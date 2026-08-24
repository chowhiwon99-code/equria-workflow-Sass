import { WorkflowsView } from "@/components/workflows/WorkflowsView"
import { PlanGate } from "@/components/shared/PlanGate"

export default function WorkflowsPage() {
  return (
    <PlanGate>
      <WorkflowsView />
    </PlanGate>
  )
}
