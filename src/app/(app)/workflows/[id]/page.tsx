import { WorkflowEditor } from "@/components/workflows/WorkflowEditor"
import { PlanGate } from "@/components/shared/PlanGate"

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <PlanGate>
      <WorkflowEditor id={id} />
    </PlanGate>
  )
}
