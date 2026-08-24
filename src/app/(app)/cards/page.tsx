import { CardsView } from "@/components/cards/CardsView"
import { PlanGate } from "@/components/shared/PlanGate"

export default function CardsPage() {
  return (
    <PlanGate>
      <CardsView />
    </PlanGate>
  )
}
