import { Workflow } from "lucide-react"
import { PagePlaceholder } from "@/components/shared/PagePlaceholder"

export default function WorkflowsPage() {
  return (
    <PagePlaceholder
      icon={Workflow}
      title="워크플로우"
      description="에이전트를 체이닝해 업무 자동화"
      phase={6}
      todo={[
        "워크플로우 목록 + 생성",
        "단계(steps) 편집 → /workflows/[id]",
        "실행 및 run_count 집계",
      ]}
    />
  )
}
