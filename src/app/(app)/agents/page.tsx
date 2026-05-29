import { Bot } from "lucide-react"
import { PagePlaceholder } from "@/components/shared/PagePlaceholder"

export default function AgentsPage() {
  return (
    <PagePlaceholder
      icon={Bot}
      title="AI 에이전트 관리"
      description="실제 대화는 좌측 하단 둥둥 떠있는 위젯에서 하세요 (⌘K로 빠르게 열기). 이 페이지는 커스텀 에이전트 생성·시스템 프롬프트 편집·사용량 통계용입니다."
      phase={3}
      todo={[
        "내 에이전트 목록 (시드 8개 + 커스텀)",
        "커스텀 에이전트 만들기 → /agents/new",
        "에이전트별 사용량 통계 (agent_usage 집계)",
        "시스템 프롬프트 새 버전 만들기 (agent_versions)",
      ]}
    />
  )
}
