import { streamText, convertToModelMessages, stepCountIs, type UIMessage, type ModelMessage } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"
import { getUserWorkspaceId, withWorkspace } from "@/lib/workspace"
import { OUTPUT_STYLE_RULE } from "@/lib/claude/style"
import { buildMeetingTools } from "@/lib/agentTools"
import { startMcpToolLoad, collectMcpTools, connectorUsageNotes } from "@/lib/mcp/loadTools"
import { meetsMinPlan } from "@/lib/plans"

export const maxDuration = 60
export const runtime = "nodejs"

/**
 * 창고에 질문(크로스미팅 질의) — 회의노트 대개편 P2 (Granola "chat with folders" 패턴).
 * 회의록·아이디어 창고 전체를 도구(검색→전문 읽기)로 횡단해 답하고, **모든 근거에 인용 링크를 강제**한다
 * (인용 없는 요약은 신뢰가 안 생긴다 — 조사 결론). assistant 라우트와 같은 골격(캐시 경계·steps 합본·
 * totalUsage), 단 대화 영속화는 없다(v1 — 질의 표면이지 대화방이 아님. 반응 좋으면 영속화 후속).
 * P3에서 개인 MCP 커넥터(loadMcpToolSets)가 여기에 합류한다(Pro+ 가드 — 대표 확정).
 */

const HISTORY_WINDOW = 8

const SYSTEM_BASE = `당신은 Complow '회의 노트·아이디어 창고' 전용 조수입니다.
팀의 회의록과 아이디어 창고를 도구로 검색·열람해 질문에 답합니다.

원칙:
- 반드시 도구로 확인한 내용만 답하세요. 기억나는 척 지어내지 마세요. 못 찾으면 못 찾았다고 하세요.
- 여러 회의를 횡단하는 질문(예: "이번 분기 반복해서 나온 문제")은 search로 후보를 모으고 get으로 전문을 확인한 뒤 종합하세요.
- **인용 필수**: 회의록을 근거로 쓴 모든 문장·항목에는 [회의록 제목](/meetings?note=<note_id>) 형식의 링크를 붙이세요. 링크 없는 근거는 쓰지 마세요.
- 한국어로 간결하게. 목록·표가 필요하면 마크다운으로.`

/** 회의록 도구만 장착한 스트리밍 질의 — useChat 프로토콜(UIMessage). */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const budget = await checkBudget(user.id, "interactive")
  if (!budget.ok) return new Response(budget.message ?? BUDGET_EXCEEDED_MSG, { status: 429 })

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  if (!workspaceId) return new Response("Forbidden", { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { messages?: UIMessage[]; connectorIds?: string[] }
  // ⚠️ 클라이언트발 system 메시지는 프롬프트 주입 — user/assistant만 신뢰(assistant 라우트와 동일).
  const messages = (body.messages ?? []).filter((m) => m.role === "user" || m.role === "assistant")
  if (messages.length === 0) return new Response("Bad Request", { status: 400 })

  const startedAt = Date.now()

  // 개인 MCP 커넥터 합류(P3) — **Pro+ 기능**(대표 확정: MCP 연동은 Pro 차별점 유지).
  // 여기가 유일한 서버 가드다. 커넥터를 못 쓰는 플랜이면 회의록 도구만으로 정상 동작한다(기능 저하 없음).
  // ⚠️ 요청받은 커넥터 id는 신뢰하지 않는다 — 본인이 실제로 연결한 것만 loadTools가 쿼리로 걸러낸다.
  const requested = Array.isArray(body.connectorIds) ? body.connectorIds.filter((c) => typeof c === "string").slice(0, 8) : []
  const { data: ws } = await supabase.from("workspaces").select("plan").eq("id", workspaceId).maybeSingle()
  const canUseConnectors = meetsMinPlan(ws?.plan, "pro")
  const connectorIds = canUseConnectors ? requested : []

  const [modelMessages, mcpResults] = await Promise.all([
    convertToModelMessages(messages.slice(-HISTORY_WINDOW)),
    startMcpToolLoad({ supabase, userId: user.id, connectorIds }),
  ])
  const { tools: mcpTools, closeAll: closeMcp } = collectMcpTools(mcpResults)
  // 네이티브(회의) 도구 + MCP 도구 — 캐시 프리픽스 안정성을 위해 최종 키를 이름순으로 고정한다.
  const merged = { ...buildMeetingTools({ supabase, workspaceId, userId: user.id }), ...mcpTools }
  const tools = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]))

  // 커넥터 사용 규칙(권한 한계)은 턴과 무관 → 캐시되는 안정 구간 끝에.
  const usageNotes = connectorIds.length > 0 ? connectorUsageNotes(connectorIds) : []
  const systemMessages: ModelMessage[] = [
    {
      role: "system",
      content: SYSTEM_BASE + (usageNotes.length ? `\n\n${usageNotes.join("\n")}` : "") + OUTPUT_STYLE_RULE,
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
  ]

  const result = streamText({
    model: anthropic(MODELS.default),
    messages: [...systemMessages, ...modelMessages],
    allowSystemInMessages: true,
    tools,
    stopWhen: stepCountIs(6), // 검색→전문 여러 건 읽기→종합까지 다단계 허용
    maxOutputTokens: 3072,
    async onFinish({ totalUsage }) {
      await closeMcp() // 연 커넥터는 반드시 닫는다(누수 방지 — loadTools 규약)
      const inT = totalUsage.inputTokens ?? 0
      const outT = totalUsage.outputTokens ?? 0
      const cacheReadTokens = totalUsage.inputTokenDetails?.cacheReadTokens ?? 0
      const cacheWriteTokens = totalUsage.inputTokenDetails?.cacheWriteTokens ?? 0
      await supabase.from("agent_usage").insert(
        withWorkspace(
          {
            user_id: user.id,
            tokens_input: inT,
            tokens_output: outT,
            cache_read_tokens: cacheReadTokens,
            cache_write_tokens: cacheWriteTokens,
            duration_ms: Date.now() - startedAt,
            success: true,
            model: MODELS.default,
            cost_usd: computeCostUsd(MODELS.default, inT, outT, {
              readTokens: cacheReadTokens,
              writeTokens: cacheWriteTokens,
            }),
          },
          workspaceId,
        ),
      )
    },
    async onError({ error }) {
      await closeMcp()
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

  void result.consumeStream({ onError: () => {} })

  return result.toUIMessageStreamResponse()
}
