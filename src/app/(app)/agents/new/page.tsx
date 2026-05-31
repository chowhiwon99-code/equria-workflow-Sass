import { BackLink } from "@/components/shared/BackLink"
import { AgentWizard } from "@/components/agents/AgentWizard"

export default function NewAgentPage() {
  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/agents" label="에이전트 관리" />
      <div>
        <h1 className="text-lg font-semibold">새 에이전트 만들기</h1>
        <p className="text-sm text-muted-foreground">
          몇 가지만 고르면 AI가 시스템 프롬프트를 만들어 줍니다. 검토·수정 후 저장하면 우하단 위젯에서 바로 대화할 수 있어요.
        </p>
      </div>
      <AgentWizard />
    </div>
  )
}
