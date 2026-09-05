import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
  type ModelMessage,
} from "ai"
import { anthropic } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { startMcpToolLoad, collectMcpTools, connectorUsageNotes } from "@/lib/mcp/loadTools"
import { buildMemoryBlock, type ExtractTurn } from "@/lib/agentMemory"
import { OUTPUT_STYLE_RULE } from "@/lib/claude/style"
import { extractAndStoreMemories } from "@/lib/agentMemoryExtract"
import { summaryBlock, turnsText, updateConversationSummary, SUMMARY_MIN_OVERFLOW } from "@/lib/conversationSummary"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserWorkspaceId, withWorkspace } from "@/lib/workspace"

export const maxDuration = 60
export const runtime = "nodejs"

const HISTORY_WINDOW = 10
// 자동 기억 추출: 매 턴 아님 — 사용자 턴이 이 값의 배수일 때만(비용·지연 방어).
const EXTRACT_EVERY_TURNS = 3

// 최근 메시지 + 이번 응답을 추출용 턴 배열로. 각 발화는 과길이 방어로 800자 컷.
function turnsForExtraction(msgs: UIMessage[], latestAssistant: string): ExtractTurn[] {
  const turns: ExtractTurn[] = []
  for (const m of msgs.slice(-12)) {
    if (m.role !== "user" && m.role !== "assistant") continue
    const text = m.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n")
      .trim()
    if (text) turns.push({ role: m.role, text: text.slice(0, 800) })
  }
  const reply = latestAssistant.trim()
  if (reply) turns.push({ role: "assistant", text: reply.slice(0, 800) })
  return turns
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json()) as {
    messages: UIMessage[]
    conversationId?: string | null
  }
  // ⚠️ UIMessage.role 에는 'system'이 포함된다 — 클라이언트가 system 메시지를 섞어 보내면
  // 우리 시스템 프롬프트 뒤에 붙어 지시를 덮어쓰는 프롬프트 주입이 된다. 이력은 user/assistant만 신뢰한다.
  const messages = (body.messages ?? []).filter((m) => m.role === "user" || m.role === "assistant")
  const userTurns = messages.filter((m) => m.role === "user").length
  let conversationId = body.conversationId ?? null

  // TTFT(첫 토큰까지 지연) 단축 — 예산·버전·워크스페이스는 서로 의존이 없어 병렬 조회(세션56 품질 기준:
  // "스무스·빠름을 토큰이 아니라 효율로"). 종전엔 직렬 await 3회 = DB 왕복 3회분 지연이었다.
  const [budget, { data: agentVersion }, workspaceId] = await Promise.all([
    checkBudget(user.id, "interactive"),
    supabase
      .from("agent_versions")
      .select("system_prompt, model, max_tokens, temperature, mcp_servers, mcp_connectors")
      .eq("agent_id", agentId)
      .eq("is_current", true)
      .maybeSingle(),
    // B1-b: 이 사용자의 워크스페이스 id(첫 멤버십). 이후 conversations/messages/agent_usage INSERT에 명시.
    getUserWorkspaceId(supabase, user.id),
  ])
  if (!budget.ok) return new Response(budget.message ?? BUDGET_EXCEEDED_MSG, { status: 429 })
  if (!agentVersion) {
    return new Response("Agent not found", { status: 404 })
  }

  if (!conversationId) {
    const firstUser = messages.find((m) => m.role === "user")
    const firstText =
      firstUser?.parts
        .map((p) => (p.type === "text" ? p.text : ""))
        .join(" ")
        .trim() ?? ""
    const title = firstText.slice(0, 30) || null

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .insert(withWorkspace({ agent_id: agentId, user_id: user.id, title }, workspaceId))
      .select("id")
      .single()
    if (convErr || !conv) {
      return new Response(convErr?.message ?? "Failed to create conversation", {
        status: 500,
      })
    }
    conversationId = conv.id
  }

  // ── 스트리밍 전 준비를 전부 병렬로(TTFT 단축, 세션56 품질 기준) ──────────────────────
  // 종전: 선저장 → 요약 → 지식(+파일 서명 순차) → 기억 → MCP서버 연결(순차) → 개인커넥터 연결(순차)의
  // 직렬 체인이라 커넥터 있는 에이전트는 첫 토큰까지 수 초가 걸렸다. 서로 의존이 없으므로 병렬로 시작하고
  // 아래 Promise.all에서 한 번에 기다린다. Supabase 빌더는 lazy thenable이라 Promise.all 시점에 실행된다.
  // ⚠️ 도구 정렬(이름순)·시스템 문자열 조립 순서는 그대로다 — 캐시 프리픽스 바이트가 달라지면 안 된다.

  // 이번 턴의 사용자 메시지 선저장(H2) — onFinish는 클라이언트가 스트림을 끝까지 소비해야 실행되므로,
  // 중단/에러 시 유실되지 않게 스트리밍 시작 전 완료를 보장한다(아래 Promise.all이 await).
  const lastUser = [...messages].reverse().find((m) => m.role === "user")
  const lastUserText =
    lastUser?.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n")
      .trim() ?? ""
  // regenerate(위젯 "다시 시도")는 같은 user 메시지를 그대로 재전송한다 — 직전 저장 행과 동일하면
  // insert를 건너뛴다(적대리뷰: 재시도마다 user 행이 쌓여 복원·요약·기억 추출 입력이 오염되던 버그).
  // 정상적인 같은 말 반복("응" 2회)은 사이에 assistant 행이 끼므로 여기 걸리지 않는다.
  const userInsertP = supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .then(async ({ data: lastRow }) => {
      if (lastRow?.[0]?.role === "user" && lastRow[0].content === lastUserText) return
      await supabase.from("messages").insert(
        withWorkspace({ conversation_id: conversationId, role: "user", content: lastUserText }, workspaceId),
      )
    })

  // 대화 요약 압축(트랙2): 기존 대화면 저장된 요약을 시스템 프롬프트에 주입. 갱신은 onFinish 백그라운드.
  const summaryP = body.conversationId
    ? supabase
        .from("conversations")
        .select("summary, summary_upto")
        .eq("id", body.conversationId)
        .maybeSingle()
    : null

  const startedAt = Date.now()
  const windowed = messages.slice(-HISTORY_WINDOW)
  // ⚠️ 직렬 유지 — CPU 작업이라 병렬화 이득이 없고, 클라이언트가 보낸 이력의 잘못된 파트로 throw할 수
  //    있다. 네트워크 leg(.then 체인)들이 시작되기 **전에** 실행해, 여기서 죽어도 열린 MCP 연결이
  //    0개이도록 한다(적대리뷰: 합류점 fail-fast가 비행 중 MCP 연결을 누수시키는 경로 차단).
  const modelMessages = await convertToModelMessages(windowed)

  // 에이전트 지식파일(참고 자료) — 텍스트는 시스템 프롬프트에, PDF/이미지는 파일 파트로.
  // 공유 에이전트를 다른 멤버가 대화할 수 있으므로 admin 클라로 서명(소유자 폴더 RLS 우회).
  // ⚠️ order 필수 — 이 결과가 그대로 캐시 프리픽스(stableSystem)의 일부가 된다. 파일 서명은
  //    행 순서를 보존한 채 병렬(Promise.all + map)로 처리한다.
  type KnowledgeFilePart =
    | { type: "file"; data: string; mediaType: string }
    | { type: "image"; image: string }
  const knowledgeP = supabase
    .from("agent_knowledge")
    .select("storage_path, name, mime_type, extracted_text")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .then(async ({ data: kn }) => {
      const textBlocks: string[] = []
      const fileParts: KnowledgeFilePart[] = []
      if (!kn || kn.length === 0) return { textBlocks, fileParts }
      // ⚠️ 이 leg는 reject하면 안 된다 — 합류점 Promise.all이 fail-fast라, 여기가 던지면 비행 중인
      //    MCP 연결이 정리자 없이 누수된다. 실패 시 지식 없이 진행(MCP 실패 격리와 동일 철학).
      try {
        const admin = createAdminClient()
        const resolved = await Promise.all(
          kn.map(async (k): Promise<{ text: string } | { part: KnowledgeFilePart } | null> => {
            if (k.extracted_text) return { text: `### ${k.name}\n${k.extracted_text}` }
            const { data: signed } = await admin.storage.from("files").createSignedUrl(k.storage_path, 300)
            if (!signed?.signedUrl) return null
            return (k.mime_type ?? "").startsWith("image/")
              ? { part: { type: "image", image: signed.signedUrl } }
              : { part: { type: "file", data: signed.signedUrl, mediaType: k.mime_type || "application/pdf" } }
          }),
        )
        for (const r of resolved) {
          if (!r) continue
          if ("text" in r) textBlocks.push(r.text)
          else fileParts.push(r.part)
        }
        return { textBlocks, fileParts }
      } catch {
        return { textBlocks: [], fileParts: [] }
      }
    })

  // 학습된 기억(v1, 개인용) — 이 사용자×이 에이전트의 활성 기억. RLS가 "본인 것만" 강제.
  // 저장은 다 하되 대화엔 최근 것 위주로 소수만(상한 30) 넣는다(컨텍스트/비용 방어).
  const memoriesP = supabase
    .from("agent_memories")
    .select("kind, content")
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .order("importance", { ascending: false }) // 중요한 규칙이 최근 잡담에 안 밀리게(마이그106)
    .order("created_at", { ascending: false })
    .limit(30)

  // MCP 서버 + 개인 커넥터의 도구 로드 — 병렬 연결(TTFT의 최대 지분). 규약(이름순 정렬·order 필수·
  // reject 금지·클라이언트 누수 방지)은 전부 lib/mcp/loadTools.ts 헤더에 있다(회의 노트 챗과 공용).
  const boundConnectors = agentVersion.mcp_connectors ?? []
  const mcpToolsP = startMcpToolLoad({
    supabase,
    userId: user.id,
    serverIds: agentVersion.mcp_servers ?? [],
    // 에이전트에 바인딩된 개인 커넥터만 — 실행자(요청자) 본인의 연결로 해석(공유 에이전트도 쓰는 사람 계정 기준).
    connectorIds: boundConnectors,
  })

  // ── 병렬 준비 합류점 — 여기까지가 첫 토큰 전 대기의 전부다 ──────────────────────────
  // ⚠️ 어떤 leg도 reject하지 않아야 한다(빌더는 {error} 반환·MCP는 loadTools 내부 처리·지식은 내부 catch).
  //    fail-fast가 일어나면 비행 중인 MCP 연결이 누수된다 — 새 leg를 추가할 때 이 규칙을 지킬 것.
  const [, convRow, knowledge, { data: mems }, mcpResults] =
    await Promise.all([userInsertP, summaryP, knowledgeP, memoriesP, mcpToolsP])

  const convSummary: string | null = convRow?.data?.summary ?? null
  const summaryUpto = convRow?.data?.summary_upto ?? 0

  // 프롬프트 캐싱 경계 — 시스템 프롬프트를 두 구간으로 나눈다.
  //   stable  : 에이전트 프롬프트·지식파일·커넥터 사용규칙 (턴이 바뀌어도 그대로 → 캐시)
  //   volatile: 기억·대화요약 (턴마다 갱신될 수 있음 → 캐시 뒤)
  // 캐싱은 '프리픽스 완전 일치'라 1바이트만 달라져도 그 뒤가 전부 무효다. 큰 지식파일이 변동 텍스트보다
  // 반드시 앞에 와야 캐시가 산다. 입력이 원가의 93~99%를 차지하므로 여기가 비용의 핵심. **조립 순서 변경 금지.**
  let stableSystem = agentVersion.system_prompt + OUTPUT_STYLE_RULE // 전 에이전트 공통 — AI 티 나는 기호(-, *, **) 절제
  let volatileSystem = ""
  if (knowledge.textBlocks.length > 0) {
    stableSystem += `\n\n# 참고 자료(회사가 첨부한 지식)\n아래 자료를 우선 근거로 삼아 답하세요. 자료에 없으면 지어내지 말고 모른다고 하세요.\n\n${knowledge.textBlocks.join("\n\n")}`
  }
  if (knowledge.fileParts.length > 0) {
    modelMessages.unshift({
      role: "user",
      content: [
        { type: "text", text: "다음은 이 에이전트의 참고 자료 파일입니다. 답변의 근거로 활용하세요." },
        ...knowledge.fileParts,
      ],
    })
  }
  volatileSystem += buildMemoryBlock(mems ?? [])
  // 오래된 턴 압축 요약 주입 — HISTORY_WINDOW 밖으로 밀려난 맥락의 망각 방지(트랙2)
  volatileSystem += summaryBlock(convSummary)
  // 커넥터 사용 규칙(권한 한계) 자동 주입 — 안 되는 도구를 시도하거나 "재인증하라"고 오안내하지 않게(예: Gmail=작성 전용).
  // 바인딩된 커넥터에서만 나오므로 턴과 무관 → 캐시되는 안정 구간에 둔다.
  const usageNotes = connectorUsageNotes(boundConnectors)
  if (usageNotes.length > 0) stableSystem += `\n\n${usageNotes.join("\n")}`

  // 이름순 정렬(프롬프트 캐시 보호)·클라이언트 수집·정리 함수는 loadTools가 담당 — 규약은 그 헤더 참고.
  const { tools, closeAll: closeMcp } = collectMcpTools(mcpResults)
  const hasTools = Object.keys(tools).length > 0

  // `system` 파라미터로는 캐시 breakpoint를 걸 수 없다(단일 문자열). system 역할 메시지로 쪼개
  // messages 맨 앞에 두고, 안정 구간 끝에만 cacheControl을 건다. 렌더 순서는 tools → system → messages.
  const systemMessages: ModelMessage[] = [
    {
      role: "system",
      content: stableSystem,
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    ...(volatileSystem ? [{ role: "system" as const, content: volatileSystem }] : []),
  ]

  const result = streamText({
    model: anthropic(agentVersion.model),
    messages: [...systemMessages, ...modelMessages],
    // 우리가 직접 만든 system 메시지만 들어간다(클라이언트발 system은 위에서 필터링). 캐시 breakpoint 때문에 필요.
    allowSystemInMessages: true,
    maxOutputTokens: agentVersion.max_tokens,
    temperature: Number(agentVersion.temperature),
    // MCP 도구가 있으면 다단계 도구호출 허용(없으면 단일 응답)
    ...(hasTools ? { tools, stopWhen: stepCountIs(5) } : {}),
    async onError({ error }) {
      // 사용자 메시지는 이미 선저장됨(위). 실패 사용량을 기록해 관측성 확보 + MCP 정리(M3).
      await Promise.all([
        supabase.from("agent_usage").insert(
          withWorkspace(
            {
              agent_id: agentId,
              user_id: user.id,
              conversation_id: conversationId,
              duration_ms: Date.now() - startedAt,
              success: false,
              error_message: error instanceof Error ? error.message : String(error),
              model: agentVersion.model,
            },
            workspaceId,
          ),
        ),
        closeMcp(),
      ])
    },
    async onFinish({ text, steps, usage, totalUsage }) {
      // 다단계(MCP 도구) 실행이면 totalUsage가 전 스텝 합산 — 비용/토큰은 합산 기준(워크플로우 run 라우트와 동일).
      const u = totalUsage ?? usage
      // ⚠️ `text`는 SDK 정의상 **마지막 스텝**의 텍스트다(`OnFinishEvent = StepResult & { steps }`).
      //    도구를 쓰는 턴이 도구 호출로 끝나면 빈 문자열이 되어 **답변이 빈 채로 저장**된다
      //    (실측 2026-08-14: 출력 2,463토큰을 썼는데 messages.content가 0자). 사용자는 스트리밍으로
      //    봤지만 새로고침하면 사라진다. → 전 스텝의 텍스트를 이어붙여 저장한다.
      const fullText =
        steps
          .map((s) => s.text)
          .filter((t) => t && t.trim().length > 0)
          .join("\n\n") || text
      // ⚠️ inputTokens는 캐시 토큰을 포함한 총합(@ai-sdk/anthropic이 합산해 넘김). 내역은 inputTokenDetails.
      // 캐시분을 빼고 계산하지 않으면 캐시 읽기(0.1×)를 정가로 청구하게 된다 — computeCostUsd가 처리.
      const inputTokens = u.inputTokens ?? 0
      const outputTokens = u.outputTokens ?? 0
      const cacheReadTokens = u.inputTokenDetails?.cacheReadTokens ?? 0
      const cacheWriteTokens = u.inputTokenDetails?.cacheWriteTokens ?? 0

      await Promise.all([
        supabase.from("messages").insert(
          withWorkspace(
            {
              conversation_id: conversationId!,
              role: "assistant",
              content: fullText,
              tokens_used: outputTokens,
              model: agentVersion.model,
            },
            workspaceId,
          ),
        ),
        supabase.from("agent_usage").insert(
          withWorkspace(
            {
              agent_id: agentId,
              user_id: user.id,
              conversation_id: conversationId,
              tokens_input: inputTokens,
              tokens_output: outputTokens,
              cache_read_tokens: cacheReadTokens,
              cache_write_tokens: cacheWriteTokens,
              duration_ms: Date.now() - startedAt,
              success: true,
              model: agentVersion.model,
              cost_usd: computeCostUsd(agentVersion.model, inputTokens, outputTokens, {
                readTokens: cacheReadTokens,
                writeTokens: cacheWriteTokens,
              }),
            },
            workspaceId,
          ),
        ),
        supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId!),
      ])
      await closeMcp()

      // 자동 기억 추출(v2) — 사용자 턴이 EXTRACT_EVERY_TURNS 배수일 때만, 백그라운드로.
      // 스트림은 이미 끝난 뒤라 사용자 대기 없음. 실패해도 채팅에 영향 없음(try/catch).
      if (userTurns > 0 && userTurns % EXTRACT_EVERY_TURNS === 0) {
        try {
          await extractAndStoreMemories(supabase, {
            agentId,
            userId: user.id,
            conversationId: conversationId!,
            workspaceId,
            // fullText(전 스텝 합본) — text는 마지막 스텝만이라 도구로 끝난 턴에서 빈 답변으로 추출된다.
            turns: turnsForExtraction(messages, fullText),
          })
        } catch {
          /* 기억 추출 실패는 채팅에 영향 주지 않음 */
        }
      }

      // 대화 요약 압축(트랙2) — 윈도우 밖으로 밀려난 미요약 턴이 충분히 쌓이면 증분 갱신.
      // 백그라운드(스트림 종료 후)·실패 무영향. summary_upto = 요약이 커버한 메시지 개수 커서.
      const overflowEnd = messages.length - HISTORY_WINDOW
      if (overflowEnd - summaryUpto >= SUMMARY_MIN_OVERFLOW) {
        try {
          await updateConversationSummary(supabase, {
            conversationId: conversationId!,
            agentId,
            userId: user.id,
            workspaceId,
            prevSummary: convSummary,
            olderText: turnsText(messages, summaryUpto, overflowEnd),
            newUpto: overflowEnd,
          })
        } catch {
          /* 요약 갱신 실패는 채팅에 영향 주지 않음 */
        }
      }
    },
  })

  // 클라이언트가 스트리밍 중 끊겨도 서버가 끝까지 소비해 onFinish가 실행되도록 한다(H2).
  // 소비 중 에러는 위 streamText onError가 이미 처리하므로 여기선 unhandled rejection만 무음 처리.
  void result.consumeStream({ onError: () => {} })

  return result.toUIMessageStreamResponse({
    headers: { "X-Conversation-Id": conversationId ?? "" },
  })
}
