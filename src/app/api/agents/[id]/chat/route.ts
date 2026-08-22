import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
  type ToolSet,
  type ModelMessage,
} from "ai"
import { anthropic } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { connectMcp, resolveUserConnectionConfig } from "@/lib/mcp/connect"
import { MCP_CONNECTORS } from "@/lib/mcp"
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

  const budget = await checkBudget(user.id, "interactive")
  if (!budget.ok) return new Response(budget.message ?? BUDGET_EXCEEDED_MSG, { status: 429 })

  const body = (await req.json()) as {
    messages: UIMessage[]
    conversationId?: string | null
  }
  // ⚠️ UIMessage.role 에는 'system'이 포함된다 — 클라이언트가 system 메시지를 섞어 보내면
  // 우리 시스템 프롬프트 뒤에 붙어 지시를 덮어쓰는 프롬프트 주입이 된다. 이력은 user/assistant만 신뢰한다.
  const messages = (body.messages ?? []).filter((m) => m.role === "user" || m.role === "assistant")
  const userTurns = messages.filter((m) => m.role === "user").length
  let conversationId = body.conversationId ?? null

  const { data: agentVersion } = await supabase
    .from("agent_versions")
    .select("system_prompt, model, max_tokens, temperature, mcp_servers, mcp_connectors")
    .eq("agent_id", agentId)
    .eq("is_current", true)
    .maybeSingle()

  if (!agentVersion) {
    return new Response("Agent not found", { status: 404 })
  }

  // B1-b: 이 사용자의 워크스페이스 id(첫 멤버십). 이후 conversations/messages/agent_usage INSERT에 명시.
  const workspaceId = await getUserWorkspaceId(supabase, user.id)

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

  // 이번 턴의 사용자 메시지를 스트리밍 전에 먼저 저장한다(H2).
  // onFinish는 클라이언트가 스트림을 끝까지 소비해야 실행되므로, 중단/에러 시 유실되지 않게 선저장.
  const lastUser = [...messages].reverse().find((m) => m.role === "user")
  const lastUserText =
    lastUser?.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n")
      .trim() ?? ""
  await supabase.from("messages").insert(
    withWorkspace({ conversation_id: conversationId, role: "user", content: lastUserText }, workspaceId),
  )

  // 대화 요약 압축(트랙2): 기존 대화면 저장된 요약을 불러와 시스템 프롬프트에 주입.
  // 갱신은 onFinish 백그라운드(다음 턴부터 반영) — 사용자 대기 0.
  let convSummary: string | null = null
  let summaryUpto = 0
  if (body.conversationId) {
    const { data: convRow } = await supabase
      .from("conversations")
      .select("summary, summary_upto")
      .eq("id", body.conversationId)
      .maybeSingle()
    convSummary = convRow?.summary ?? null
    summaryUpto = convRow?.summary_upto ?? 0
  }

  const startedAt = Date.now()
  const windowed = messages.slice(-HISTORY_WINDOW)
  const modelMessages = await convertToModelMessages(windowed)

  // 에이전트 지식파일(참고 자료) 주입 — 텍스트는 시스템 프롬프트에, PDF/이미지는 파일 파트로.
  // 공유 에이전트를 다른 멤버가 대화할 수 있으므로 admin 클라로 서명(소유자 폴더 RLS 우회).
  // 프롬프트 캐싱 경계 — 시스템 프롬프트를 두 구간으로 나눈다.
  //   stable  : 에이전트 프롬프트·지식파일·커넥터 사용규칙 (턴이 바뀌어도 그대로 → 캐시)
  //   volatile: 기억·대화요약 (턴마다 갱신될 수 있음 → 캐시 뒤)
  // 캐싱은 '프리픽스 완전 일치'라 1바이트만 달라져도 그 뒤가 전부 무효다. 큰 지식파일이 변동 텍스트보다
  // 반드시 앞에 와야 캐시가 산다. 입력이 원가의 93~99%를 차지하므로 여기가 비용의 핵심.
  let stableSystem = agentVersion.system_prompt + OUTPUT_STYLE_RULE // 전 에이전트 공통 — AI 티 나는 기호(-, *, **) 절제
  let volatileSystem = ""
  {
    // ⚠️ order 필수 — 이 결과가 그대로 캐시 프리픽스(stableSystem)의 일부가 된다.
    //    행 순서가 흔들리면 프롬프트 앞부분이 1바이트 달라져 프롬프트 캐시가 통째로 무효가 된다.
    const { data: kn } = await supabase
      .from("agent_knowledge")
      .select("storage_path, name, mime_type, extracted_text")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
    if (kn && kn.length > 0) {
      const textBlocks: string[] = []
      const fileParts: Array<
        { type: "file"; data: string; mediaType: string } | { type: "image"; image: string }
      > = []
      const admin = createAdminClient()
      for (const k of kn) {
        if (k.extracted_text) {
          textBlocks.push(`### ${k.name}\n${k.extracted_text}`)
        } else {
          const { data: signed } = await admin.storage.from("files").createSignedUrl(k.storage_path, 300)
          if (!signed?.signedUrl) continue
          if ((k.mime_type ?? "").startsWith("image/")) fileParts.push({ type: "image", image: signed.signedUrl })
          else fileParts.push({ type: "file", data: signed.signedUrl, mediaType: k.mime_type || "application/pdf" })
        }
      }
      if (textBlocks.length > 0) {
        stableSystem += `\n\n# 참고 자료(회사가 첨부한 지식)\n아래 자료를 우선 근거로 삼아 답하세요. 자료에 없으면 지어내지 말고 모른다고 하세요.\n\n${textBlocks.join("\n\n")}`
      }
      if (fileParts.length > 0) {
        modelMessages.unshift({
          role: "user",
          content: [
            { type: "text", text: "다음은 이 에이전트의 참고 자료 파일입니다. 답변의 근거로 활용하세요." },
            ...fileParts,
          ],
        })
      }
    }
  }

  // 학습된 기억 주입(v1, 개인용) — 이 사용자×이 에이전트의 활성 기억. RLS가 "본인 것만" 강제.
  // 저장은 다 하되 대화엔 최근 것 위주로 소수만(상한 30) 넣는다(컨텍스트/비용 방어).
  {
    const { data: mems } = await supabase
      .from("agent_memories")
      .select("kind, content")
      .eq("agent_id", agentId)
      .is("deleted_at", null)
      .order("importance", { ascending: false }) // 중요한 규칙이 최근 잡담에 안 밀리게(마이그106)
      .order("created_at", { ascending: false })
      .limit(30)
    volatileSystem += buildMemoryBlock(mems ?? [])
  }

  // 오래된 턴 압축 요약 주입 — HISTORY_WINDOW 밖으로 밀려난 맥락의 망각 방지(트랙2)
  volatileSystem += summaryBlock(convSummary)

  // 에이전트에 연결된 MCP 서버의 도구 로드(있으면). 연결/도구로딩 실패 서버는 건너뜀.
  // ⚠️ tools()도 반드시 try 안에서 — 커넥터 하나의 실패가 채팅 전체를 죽이면 안 된다(워크플로우 run 라우트와 동일 규약).
  const mcpClients: Awaited<ReturnType<typeof connectMcp>>[] = []
  const toolSets: ToolSet[] = []
  const mcpIds = agentVersion.mcp_servers ?? []
  if (mcpIds.length > 0) {
    // ⚠️ order 필수 — 도구 정의는 렌더 순서상 system보다 **앞**이라, 도구 키 순서가 흔들리면
    //    프롬프트 캐시가 system까지 통째로 무효가 된다(캐시는 prefix 완전 일치).
    const { data: mcpServers } = await supabase
      .from("mcp_servers")
      .select("id, name, type, url, auth_type, is_active, encrypted_token")
      .in("id", mcpIds)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
    for (const srv of mcpServers ?? []) {
      try {
        const client = await connectMcp(srv)
        mcpClients.push(client)
        toolSets.push(await client.tools())
      } catch {
        /* 연결/도구로딩 실패 MCP 서버는 건너뜀 — 도구 없이 진행 */
      }
    }
  }
  // 에이전트에 바인딩된 개인 MCP 커넥터만 — 실행자(요청자) 본인의 연결로 해석(공유 에이전트도 쓰는 사람 계정 기준).
  const boundConnectors = agentVersion.mcp_connectors ?? []
  // 커넥터 사용 규칙(권한 한계) 자동 주입 — 안 되는 도구를 시도하거나 "재인증하라"고 오안내하지 않게(예: Gmail=작성 전용)
  const usageNotes = MCP_CONNECTORS.filter((c) => boundConnectors.includes(c.id) && c.usageNote).map(
    (c) => `[${c.name} 사용 규칙] ${c.usageNote}`
  )
  // 커넥터 사용규칙은 바인딩된 커넥터에서만 나오므로 턴과 무관 → 캐시되는 안정 구간에 둔다.
  if (usageNotes.length > 0) stableSystem += `\n\n${usageNotes.join("\n")}`
  if (boundConnectors.length > 0) {
    const CONN_COLS = "id, connector_id, auth_method, encrypted_token, encrypted_refresh_token"
    // ⚠️ order 필수 — 위 mcp_servers와 같은 이유(도구 키 순서 = 캐시 프리픽스).
    const { data: myConnections } = await supabase
      .from("mcp_user_connections")
      .select(CONN_COLS)
      .eq("user_id", user.id)
      .in("connector_id", boundConnectors)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
    for (const row of myConnections ?? []) {
      const cfg = resolveUserConnectionConfig(row, user.id)
      if (!cfg) continue
      try {
        const client = await connectMcp(cfg)
        mcpClients.push(client)
        toolSets.push(await client.tools())
      } catch {
        // access token 만료 시 일부 서버(구글 gmailmcp 등)가 첫 호출에 401을 던지는데,
        // 그 과정에서 SDK OAuth 프로바이더가 refresh_token으로 갱신해 DB에 저장한다.
        // → 갱신된 행을 다시 읽어 1회만 재연결(이게 없으면 만료 직후 첫 요청이 항상 실패).
        try {
          const { data: fresh } = await supabase
            .from("mcp_user_connections")
            .select(CONN_COLS)
            .eq("id", row.id)
            .maybeSingle()
          const retryCfg = fresh ? resolveUserConnectionConfig(fresh, user.id) : null
          if (retryCfg) {
            const retryClient = await connectMcp(retryCfg)
            mcpClients.push(retryClient)
            toolSets.push(await retryClient.tools())
          }
        } catch {
          /* 재시도도 실패하면 이 커넥터 없이 진행 — 채팅 자체는 계속된다 */
        }
      }
    }
  }
  // 🔴 **이름순 정렬은 프롬프트 캐시를 살리는 장치다(장식이 아니다).**
  //    도구 정의는 프롬프트의 **맨 앞(position 0)** 에 렌더된다 — 렌더 순서는 tools → system → messages.
  //    따라서 도구 배열이 1바이트만 달라져도 tools·system·messages 캐시가 **통째로** 무효가 된다.
  //    그런데 여기 들어오는 순서는 우리가 정하지 않는다:
  //      · MCP 서버가 tools()로 돌려주는 순서는 규격상 보장되지 않고,
  //      · 커넥터 하나가 토큰 만료로 재연결 경로를 타면 그 서버 도구가 뒤늦게 push된다(위 재시도 블록).
  //    즉 같은 대화 안에서도 호출마다 순서가 바뀔 수 있다. MCP 도구는 여기서 가장 큰 덩어리라
  //    (실측: Notion clean 입력 91,706토큰) 무효화되면 그 비용을 매번 정가로 낸다.
  //    Object.keys 순서가 그대로 전송 배열 순서가 되므로, 이름순으로 고정해 바이트를 안정시킨다.
  const mergedTools: ToolSet = Object.assign({}, ...toolSets)
  const tools: ToolSet = Object.fromEntries(
    Object.keys(mergedTools)
      .sort()
      .map((name) => [name, mergedTools[name]]),
  )
  const hasTools = Object.keys(tools).length > 0
  const closeMcp = () => Promise.allSettled(mcpClients.map((c) => c.close()))

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
