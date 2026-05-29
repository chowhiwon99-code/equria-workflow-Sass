import { Workflow } from "lucide-react"
import { PagePlaceholder } from "@/components/shared/PagePlaceholder"

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <PagePlaceholder
      icon={Workflow}
      title="워크플로우 편집"
      description={`워크플로우 ID: ${id}`}
      phase={6}
      todo={[
        "단계별 에이전트 체이닝 편집기",
        "입력 → 에이전트 → 다음 단계로 전달",
        "실행 결과 미리보기",
      ]}
    />
  )
}
