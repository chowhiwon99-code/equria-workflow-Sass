import { streamText, convertToModelMessages, type UIMessage } from "ai"
import { anthropic } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"

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
    .select("system_prompt, model, max_tokens, temperature")
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

  const result = streamText({
    model: anthropic(agentVersion.model),
    system: agentVersion.system_prompt,
    messages: modelMessages,
    maxOutputTokens: agentVersion.max_tokens,
    temperature: Number(agentVersion.temperature),
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
        }),
        supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId!),
      ])
    },
  })

  return result.toUIMessageStreamResponse({
    headers: { "X-Conversation-Id": conversationId ?? "" },
  })
}
