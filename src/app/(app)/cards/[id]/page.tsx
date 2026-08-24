import { CardDetail } from "@/components/cards/CardDetail"
import { PlanGate } from "@/components/shared/PlanGate"

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <PlanGate>
      <CardDetail cardId={id} />
    </PlanGate>
  )
}
