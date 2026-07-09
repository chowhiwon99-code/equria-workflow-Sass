import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

/** 개인 연결 해제 — 본인 것만(RLS). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ connectorId: string }> }) {
  const { connectorId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { error } = await supabase
    .from("mcp_user_connections")
    .delete()
    .eq("connector_id", connectorId)
    .eq("user_id", user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
