import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

/** 이 에이전트와 내가 나눈 대화 목록(최근순). RLS + user_id로 본인 것만. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { data } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("agent_id", agentId)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50)

  return NextResponse.json({ conversations: data ?? [] })
}
