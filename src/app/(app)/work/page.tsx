import { WorkView } from "@/components/work/WorkView"
import { PlanGate } from "@/components/shared/PlanGate"

export default function WorkPage() {
  return (
    <PlanGate>
      <WorkView />
    </PlanGate>
  )
}
