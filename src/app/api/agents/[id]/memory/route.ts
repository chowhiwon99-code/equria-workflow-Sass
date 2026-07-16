import { createClient } from "@/lib/supabase/server"
import { isMemoryKind } from "@/lib/agentMemory"

export const runtime = "nodejs"

// 이 에이전트에 대한 내 기억 목록(활성만). RLS가 "본인 것만"을 강제한다.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const { data, error } = await supabase
    .from("agent_memories")
    .select("id, kind, content, created_at")
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ memories: data ?? [] })
}

// 기억 추가("이거 기억해두기"). content 필수, kind 기본 preference.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as
    | { content?: string; kind?: string; sourceConversationId?: string | null }
    | null
  const content = body?.content?.trim()
  if (!content) return new Response("content required", { status: 400 })
  const kind = isMemoryKind(body?.kind) ? body!.kind : "preference"

  const { data, error } = await supabase
    .from("agent_memories")
    .insert({
      agent_id: agentId,
      user_id: user.id,
      content,
      kind,
      source_conversation_id: body?.sourceConversationId ?? null,
    })
    .select("id, kind, content, created_at")
    .single()
  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ memory: data })
}
