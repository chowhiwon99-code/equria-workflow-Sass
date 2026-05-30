import { BackLink } from "@/components/shared/BackLink"
import { AgentBuilderForm } from "@/components/agents/AgentBuilderForm"

export default function NewAgentPage() {
  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/agents" label="에이전트 관리" />
      <div>
        <h1 className="text-lg font-semibold">새 에이전트 만들기</h1>
        <p className="text-sm text-muted-foreground">
          시스템 프롬프트로 역할을 정의하면, 우하단 위젯에서 바로 대화할 수 있어요.
        </p>
      </div>
      <AgentBuilderForm />
    </div>
  )
}
