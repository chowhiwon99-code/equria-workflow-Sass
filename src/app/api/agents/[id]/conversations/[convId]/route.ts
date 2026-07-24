import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

// 대화가 본인 것인지 확인(convId는 열거 불가한 uuid지만, 메시지 조회 전 소유권 방어).
async function ownsConversation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  convId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase.from("conversations").select("user_id").eq("id", convId).maybeSingle()
  return !!data && data.user_id === userId
}

/** 한 대화의 메시지(시간순). 본인 대화만. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; convId: string }> }) {
  const { convId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })
  if (!(await ownsConversation(supabase, convId, user.id))) {
    return NextResponse.json({ messages: [] })
  }

  const { data } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })

  return NextResponse.json({ messages: data ?? [] })
}

/** 대화 삭제(본인 것만). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; convId: string }> }) {
  const { convId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })
  if (!(await ownsConversation(supabase, convId, user.id))) {
    return new NextResponse("Not found", { status: 404 })
  }

  await supabase.from("conversations").delete().eq("id", convId)
  return NextResponse.json({ ok: true })
}
