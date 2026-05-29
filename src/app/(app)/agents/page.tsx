import { Bot } from "lucide-react"
import { PagePlaceholder } from "@/components/shared/PagePlaceholder"

export default function AgentsPage() {
  return (
    <PagePlaceholder
      icon={Bot}
      title="AI 에이전트 허브"
      description="8개 기본 에이전트 + 커스텀 에이전트 목록"
      phase={2}
      todo={[
        "에이전트 카드 그리드 (카테고리 필터)",
        "에이전트 클릭 → 채팅 화면(/agents/[id])",
        "커스텀 에이전트 만들기 버튼 → /agents/new",
      ]}
    />
  )
}
