import { Bot } from "lucide-react"
import { PagePlaceholder } from "@/components/shared/PagePlaceholder"

export default function NewAgentPage() {
  return (
    <PagePlaceholder
      icon={Bot}
      title="에이전트 만들기"
      description="직원이 직접 에이전트를 생성/등록"
      phase={3}
      todo={[
        "이름·카테고리·아이콘 입력",
        "시스템 프롬프트 작성 + 모델/온도/max_tokens 설정",
        "저장 시 agents + 첫 agent_versions 생성",
      ]}
    />
  )
}
