import { BackLink } from "@/components/shared/BackLink"
import { AgentWizard } from "@/components/agents/AgentWizard"

/**
 * ?mcp=<serverId>      — /mcp "에이전트 만들기" 바로가기. 해당 MCP가 미리 선택된 채 시작.
 * ?template=<id>       — /agents 예시 갤러리에서 진입. 위저드 답변이 미리 채워진 채 시작.
 *                        (없는 id면 그냥 무시하고 평소대로 시작 — 링크가 낡아도 깨지지 않는다)
 */
export default async function NewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ mcp?: string; template?: string }>
}) {
  const { mcp, template } = await searchParams
  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/agents" label="에이전트 관리" />
      <div>
        <h1 className="text-lg font-semibold">새 에이전트 만들기</h1>
        <p className="text-sm text-muted-foreground">
          몇 가지만 고르면 AI가 시스템 프롬프트를 만들어 줍니다. 검토·수정 후 저장하면 우하단 위젯에서 바로 대화할 수 있어요.
        </p>
      </div>
      <AgentWizard mcpPrefill={mcp ? [mcp] : undefined} templateId={template} />
    </div>
  )
}
