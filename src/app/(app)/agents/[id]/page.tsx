import { Bot } from "lucide-react"
import { PagePlaceholder } from "@/components/shared/PagePlaceholder"

export default async function AgentChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <PagePlaceholder
      icon={Bot}
      title="에이전트 채팅"
      description={`에이전트 ID: ${id}`}
      phase={2}
      todo={[
        "Vercel AI SDK useChat 채팅 인터페이스 (latest-stack.md 패턴)",
        "POST /api/agents/[id]/chat 스트리밍 연동",
        "대화 내역 conversations + messages 저장/로드",
      ]}
    />
  )
}
