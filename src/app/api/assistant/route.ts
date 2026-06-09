import { streamText, convertToModelMessages, type UIMessage } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { computeCostUsd } from "@/lib/pricing"

export const maxDuration = 60
export const runtime = "nodejs"

const HISTORY_WINDOW = 12
const SYSTEM = `당신은 이큐리아(EQURIA) 워크스페이스의 AI 어시스턴트입니다.
이큐리아는 K-뷰티 브랜드이고, 이 워크스페이스는 직원 전용 사내 도구입니다.
직원의 업무(문서·아이디어·번역·요약·정리 등)를 한국어로 간결하고 정확하게 돕습니다.
모르는 것은 모른다고 솔직히 말하세요.`

function lastUserText(messages: UIMessage[]): string {
  const u = [...messages].reverse().find((m) => m.role === "user")
  return (
    u?.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n")
      .trim() ?? ""
  )
}

/** 대시보드 범용 Claude 어시스턴트 — 대화방(assistant_conversations)에 영속화. */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    messages?: UIMessage[]
    conversationId?: string | null
  }
  const messages = body.messages ?? []
  let conversationId = body.conversationId ?? null

  // 새 대화면 생성(제목 = 첫 사용자 메시지 일부)
  if (!conversationId) {
    const title = lastUserText(messages).slice(0, 40) || null
    const { data: conv } = await supabase
      .from("assistant_conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .single()
    conversationId = conv?.id ?? null
  }

  const modelMessages = await convertToModelMessages(messages.slice(-HISTORY_WINDOW))

  const result = streamText({
    model: anthropic(MODELS.default),
    system: SYSTEM,
    messages: modelMessages,
    maxOutputTokens: 2048,
    async onFinish({ text, usage }) {
      // 비용 추적: 어시스턴트도 Claude 호출 → agent_usage 기록(agent/conversation 없는 대시보드 호출)
      const inT = usage.inputTokens ?? 0
      const outT = usage.outputTokens ?? 0
      void supabase.from("agent_usage").insert({
        user_id: user.id,
        tokens_input: inT,
        tokens_output: outT,
        success: true,
        model: MODELS.default,
        cost_usd: computeCostUsd(MODELS.default, inT, outT),
      })
      if (!conversationId) return
      // 이번 턴(마지막 사용자 메시지 + 새 어시스턴트 답변)만 저장
      await supabase.from("assistant_messages").insert([
        { conversation_id: conversationId, role: "user", content: lastUserText(messages) },
        { conversation_id: conversationId, role: "assistant", content: text },
      ])
      await supabase
        .from("assistant_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId)
    },
  })

  return result.toUIMessageStreamResponse({
    headers: conversationId ? { "X-Conversation-Id": conversationId } : undefined,
  })
}
