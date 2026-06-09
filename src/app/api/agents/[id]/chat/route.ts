import { streamText, convertToModelMessages, stepCountIs, type UIMessage, type ToolSet } from "ai"
import { anthropic } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { connectMcp } from "@/lib/mcp/connect"
import { computeCostUsd } from "@/lib/pricing"

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

  const body = (await req.json()) as {
    messages: UIMessage[]
    conversationId?: string | null
  }
  const { messages } = body
  let conversationId = body.conversationId ?? null

  const { data: agentVersion } = await supabase
    .from("agent_versions")
    .select("system_prompt, model, max_tokens, temperature, mcp_servers")
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

  const startedAt = Date.now()
  const windowed = messages.slice(-HISTORY_WINDOW)
  const modelMessages = await convertToModelMessages(windowed)

  // 에이전트에 연결된 MCP 서버의 도구 로드(있으면). 연결 실패 서버는 건너뜀.
  const mcpClients: Awaited<ReturnType<typeof connectMcp>>[] = []
  const mcpIds = agentVersion.mcp_servers ?? []
  if (mcpIds.length > 0) {
    const { data: mcpServers } = await supabase
      .from("mcp_servers")
      .select("id, name, type, url, auth_type, is_active")
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
  const toolSets = await Promise.all(mcpClients.map((c) => c.tools()))
  const tools: ToolSet = Object.assign({}, ...toolSets)
  const hasTools = Object.keys(tools).length > 0
  const closeMcp = () => Promise.allSettled(mcpClients.map((c) => c.close()))

  const result = streamText({
    model: anthropic(agentVersion.model),
    system: agentVersion.system_prompt,
    messages: modelMessages,
    maxOutputTokens: agentVersion.max_tokens,
    temperature: Number(agentVersion.temperature),
    // MCP 도구가 있으면 다단계 도구호출 허용(없으면 단일 응답)
    ...(hasTools ? { tools, stopWhen: stepCountIs(5) } : {}),
    onError() {
      void closeMcp()
    },
    async onFinish({ text, usage }) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user")
      const lastUserText =
        lastUser?.parts
          .map((p) => (p.type === "text" ? p.text : ""))
          .join("\n")
          .trim() ?? ""

      const inputTokens = usage.inputTokens ?? 0
      const outputTokens = usage.outputTokens ?? 0

      await Promise.all([
        supabase.from("messages").insert([
          {
            conversation_id: conversationId!,
            role: "user",
            content: lastUserText,
          },
          {
            conversation_id: conversationId!,
            role: "assistant",
            content: text,
            tokens_used: outputTokens,
            model: agentVersion.model,
          },
        ]),
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

  return result.toUIMessageStreamResponse({
    headers: { "X-Conversation-Id": conversationId ?? "" },
  })
}
