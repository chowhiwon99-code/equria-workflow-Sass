import { DocumentDetail } from "@/components/approval/DocumentDetail"
import { PlanGate } from "@/components/shared/PlanGate"

export default async function ApprovalDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <PlanGate>
      <DocumentDetail docId={id} />
    </PlanGate>
  )
}
