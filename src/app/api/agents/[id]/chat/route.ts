import { streamText, convertToModelMessages, stepCountIs, type UIMessage, type ToolSet } from "ai"
import { anthropic } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { connectMcp, resolveUserConnectionConfig } from "@/lib/mcp/connect"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 60
export const runtime = "nodejs"

const HISTORY_WINDOW = 10

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

  const budget = await checkBudget(user.id)
  if (!budget.ok) return new Response(BUDGET_EXCEEDED_MSG, { status: 429 })

  const body = (await req.json()) as {
    messages: UIMessage[]
    conversationId?: string | null
  }
  const { messages } = body
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
      .insert({ agent_id: agentId, user_id: user.id, title })
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
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: lastUserText,
  })

  const startedAt = Date.now()
  const windowed = messages.slice(-HISTORY_WINDOW)
  const modelMessages = await convertToModelMessages(windowed)

  // 에이전트 지식파일(참고 자료) 주입 — 텍스트는 시스템 프롬프트에, PDF/이미지는 파일 파트로.
  // 공유 에이전트를 다른 멤버가 대화할 수 있으므로 admin 클라로 서명(소유자 폴더 RLS 우회).
  let systemPrompt = agentVersion.system_prompt
  {
    const { data: kn } = await supabase
      .from("agent_knowledge")
      .select("storage_path, name, mime_type, extracted_text")
      .eq("agent_id", agentId)
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
        systemPrompt += `\n\n# 참고 자료(회사가 첨부한 지식)\n아래 자료를 우선 근거로 삼아 답하세요. 자료에 없으면 지어내지 말고 모른다고 하세요.\n\n${textBlocks.join("\n\n")}`
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

  // 에이전트에 연결된 MCP 서버의 도구 로드(있으면). 연결 실패 서버는 건너뜀.
  const mcpClients: Awaited<ReturnType<typeof connectMcp>>[] = []
  const mcpIds = agentVersion.mcp_servers ?? []
  if (mcpIds.length > 0) {
    const { data: mcpServers } = await supabase
      .from("mcp_servers")
      .select("id, name, type, url, auth_type, is_active, encrypted_token")
      .in("id", mcpIds)
      .eq("is_active", true)
    for (const srv of mcpServers ?? []) {
      try {
        mcpClients.push(await connectMcp(srv))
      } catch {
        /* 연결 실패 MCP 서버는 건너뜀 */
      }
    }
  }
  // 에이전트에 바인딩된 개인 MCP 커넥터만 — 실행자(요청자) 본인의 연결로 해석(공유 에이전트도 쓰는 사람 계정 기준).
  const boundConnectors = agentVersion.mcp_connectors ?? []
  if (boundConnectors.length > 0) {
    const { data: myConnections } = await supabase
      .from("mcp_user_connections")
      .select("id, connector_id, auth_method, encrypted_token, encrypted_refresh_token")
      .eq("user_id", user.id)
      .in("connector_id", boundConnectors)
    for (const row of myConnections ?? []) {
      const cfg = resolveUserConnectionConfig(row, user.id)
      if (!cfg) continue
      try {
        mcpClients.push(await connectMcp(cfg))
      } catch {
        /* 연결 실패한 개인 커넥터는 건너뜀 */
      }
    }
  }
  const toolSets = await Promise.all(mcpClients.map((c) => c.tools()))
  const tools: ToolSet = Object.assign({}, ...toolSets)
  const hasTools = Object.keys(tools).length > 0
  const closeMcp = () => Promise.allSettled(mcpClients.map((c) => c.close()))

  const result = streamText({
    model: anthropic(agentVersion.model),
    system: systemPrompt,
    messages: modelMessages,
    maxOutputTokens: agentVersion.max_tokens,
    temperature: Number(agentVersion.temperature),
    // MCP 도구가 있으면 다단계 도구호출 허용(없으면 단일 응답)
    ...(hasTools ? { tools, stopWhen: stepCountIs(5) } : {}),
    async onError({ error }) {
      // 사용자 메시지는 이미 선저장됨(위). 실패 사용량을 기록해 관측성 확보 + MCP 정리(M3).
      await Promise.all([
        supabase.from("agent_usage").insert({
          agent_id: agentId,
          user_id: user.id,
          conversation_id: conversationId,
          duration_ms: Date.now() - startedAt,
          success: false,
          error_message: error instanceof Error ? error.message : String(error),
          model: agentVersion.model,
        }),
        closeMcp(),
      ])
    },
    async onFinish({ text, usage }) {
      const inputTokens = usage.inputTokens ?? 0
      const outputTokens = usage.outputTokens ?? 0

      await Promise.all([
        supabase.from("messages").insert({
          conversation_id: conversationId!,
          role: "assistant",
          content: text,
          tokens_used: outputTokens,
          model: agentVersion.model,
        }),
        supabase.from("agent_usage").insert({
          agent_id: agentId,
          user_id: user.id,
          conversation_id: conversationId,
          tokens_input: inputTokens,
          tokens_output: outputTokens,
          duration_ms: Date.now() - startedAt,
          success: true,
          model: agentVersion.model,
          cost_usd: computeCostUsd(agentVersion.model, inputTokens, outputTokens),
        }),
        supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId!),
      ])
      await closeMcp()
    },
  })

  // 클라이언트가 스트리밍 중 끊겨도 서버가 끝까지 소비해 onFinish가 실행되도록 한다(H2).
  // 소비 중 에러는 위 streamText onError가 이미 처리하므로 여기선 unhandled rejection만 무음 처리.
  void result.consumeStream({ onError: () => {} })

  return result.toUIMessageStreamResponse({
    headers: { "X-Conversation-Id": conversationId ?? "" },
  })
}
