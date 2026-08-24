import { MeetingsView } from "@/components/meetings/MeetingsView"
import { PlanGate } from "@/components/shared/PlanGate"

export default function MeetingsPage() {
  return (
    <PlanGate>
      <MeetingsView />
    </PlanGate>
  )
}
