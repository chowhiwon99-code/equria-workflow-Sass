import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"
import { getUserWorkspaceId, withWorkspace } from "@/lib/workspace"
import { OUTPUT_STYLE_RULE } from "@/lib/claude/style"
import { buildWorkspaceSnapshot, featuresOverview } from "@/lib/workspaceContext"
import { buildCompiTools } from "@/lib/agentTools"

export const maxDuration = 60
export const runtime = "nodejs"

const HISTORY_WINDOW = 12
// 컴피(Compi) — 워크스페이스를 다 아는 개인 전용 범용 비서. 아래 페르소나 + 기능 레지스트리 + 현황 스냅샷 + 네이티브 도구.
const COMPI_BASE = `당신은 '컴피(Compi)' — Complow 워크스페이스의 개인 전용 비서입니다.
사용자가 속한 회사(워크스페이스)의 현재 상태와 모든 기능을 파악하고, 자연어 질문에 답하며 업무를 돕습니다.

원칙:
- 근태 잔여·프로젝트·일정·할 일 등 실제 수치·목록이 필요하면 제공된 도구로 조회한 뒤 답하세요. 추측하거나 지어내지 마세요.
- 도구 결과가 비어 있으면 솔직히 말하고, 필요한 설정(예: 연차 잔여는 오너/근태 위임자만 조회 가능하며 구성원 입사일·HR 기준 설정이 필요)을 안내하세요.
- 아래 '워크스페이스 기능'과 '현재 현황'은 참고용 배경입니다. 최신·정확한 값은 도구로 확인하세요.
- 한국어로 간결·정확하게. 목록/표가 필요하면 마크다운으로 정리하세요.`

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
  // 게스트/무소속 차단(fail-closed) — wsId 없으면 예산·usage 기록을 우회하고 도구/스냅샷 스코프도 불가.
  if (!workspaceId) return new Response("Forbidden", { status: 403 })

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

  // 워크스페이스 인지 = 기능 레지스트리 + 현황 스냅샷(실패해도 대화는 진행) + 네이티브 도구.
  const snapshot = await buildWorkspaceSnapshot(supabase, user.id).catch(() => "(현황 조회 실패)")
  const system = `${COMPI_BASE}\n\n## 워크스페이스 기능\n${featuresOverview()}\n\n## 현재 현황(스냅샷)\n${snapshot}${OUTPUT_STYLE_RULE}`
  const tools = buildCompiTools({ supabase, userId: user.id, workspaceId })

  const result = streamText({
    model: anthropic(MODELS.default),
    system,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5), // 도구 조회 후 답변까지 다단계 허용
    maxOutputTokens: 3072,
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
