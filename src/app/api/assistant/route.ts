import { streamText, convertToModelMessages, type UIMessage } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"
import { getUserWorkspaceId, withWorkspace } from "@/lib/workspace"

export const maxDuration = 60
export const runtime = "nodejs"

const HISTORY_WINDOW = 12
const SYSTEM = `당신은 Complow 워크스페이스의 AI 어시스턴트입니다.
Complow는 회사 업무를 AI로 돕는 사내 워크스페이스이고, 직원 전용 도구입니다.
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

  const budget = await checkBudget(user.id)
  if (!budget.ok) return new Response(BUDGET_EXCEEDED_MSG, { status: 429 })

  // B1-b: 이후 assistant_conversations/messages/agent_usage INSERT에 명시할 워크스페이스 id.
  const workspaceId = await getUserWorkspaceId(supabase, user.id)

  const body = (await req.json().catch(() => ({}))) as {
    messages?: UIMessage[]
    conversationId?: string | null
  }
  const messages = body.messages ?? []
  let conversationId = body.conversationId ?? null

  // 새 대화면 생성(제목 = 첫 사용자 메시지 일부). 생성 실패 시 500으로 막아 턴이 조용히 유실되지 않게(M2).
  if (!conversationId) {
    const title = lastUserText(messages).slice(0, 40) || null
    const { data: conv, error: convErr } = await supabase
      .from("assistant_conversations")
      .insert(withWorkspace({ user_id: user.id, title }, workspaceId))
      .select("id")
      .single()
    if (convErr || !conv) {
      return new Response(convErr?.message ?? "Failed to create conversation", {
        status: 500,
      })
    }
    conversationId = conv.id
  }
  const convId = conversationId

  // 이번 턴의 사용자 메시지를 스트리밍 전에 먼저 저장(중단/에러로 onFinish가 안 돌아도 유실 방지·H2).
  await supabase.from("assistant_messages").insert(
    withWorkspace({ conversation_id: convId, role: "user", content: lastUserText(messages) }, workspaceId),
  )

  const startedAt = Date.now()
  const modelMessages = await convertToModelMessages(messages.slice(-HISTORY_WINDOW))

  const result = streamText({
    model: anthropic(MODELS.default),
    system: SYSTEM,
    messages: modelMessages,
    maxOutputTokens: 2048,
    async onFinish({ text, usage }) {
      // 비용 추적: 어시스턴트도 Claude 호출 → agent_usage 기록. await로 묶어 전송 보장(M1: 기존 void는 전송 안 됨).
      const inT = usage.inputTokens ?? 0
      const outT = usage.outputTokens ?? 0
      await Promise.all([
        supabase.from("agent_usage").insert(
          withWorkspace(
            {
              user_id: user.id,
              tokens_input: inT,
              tokens_output: outT,
              duration_ms: Date.now() - startedAt,
              success: true,
              model: MODELS.default,
              cost_usd: computeCostUsd(MODELS.default, inT, outT),
            },
            workspaceId,
          ),
        ),
        // 이번 턴의 어시스턴트 답변만 저장(사용자 메시지는 위에서 선저장)
        supabase.from("assistant_messages").insert(
          withWorkspace({ conversation_id: convId, role: "assistant", content: text }, workspaceId),
        ),
        supabase
          .from("assistant_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", convId),
      ])
    },
    async onError({ error }) {
      // 사용자 메시지는 이미 선저장됨. 실패 사용량 기록(관측성).
      await supabase.from("agent_usage").insert(
        withWorkspace(
          {
            user_id: user.id,
            duration_ms: Date.now() - startedAt,
            success: false,
            error_message: error instanceof Error ? error.message : String(error),
            model: MODELS.default,
          },
          workspaceId,
        ),
      )
    },
  })

  // 클라이언트가 끊겨도 서버가 끝까지 소비해 onFinish가 실행되도록 한다(H2).
  // 소비 중 에러는 위 streamText onError가 이미 처리하므로 여기선 unhandled rejection만 무음 처리.
  void result.consumeStream({ onError: () => {} })

  return result.toUIMessageStreamResponse({
    headers: { "X-Conversation-Id": convId },
  })
}
