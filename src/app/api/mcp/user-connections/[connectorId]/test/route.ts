import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { discoverMcpTools, resolveUserConnectionConfig } from "@/lib/mcp/connect"
import { summarizeToolsKo } from "@/lib/mcp/summarize"

export const runtime = "nodejs"
export const maxDuration = 60

/** 개인 연결 재테스트 — 본인 것만(RLS). bearer·oauth 공용(resolveUserConnectionConfig가 분기). */
export async function POST(_req: Request, { params }: { params: Promise<{ connectorId: string }> }) {
  const { connectorId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { data: row } = await supabase
    .from("mcp_user_connections")
    .select("id, connector_id, auth_method, encrypted_token, encrypted_refresh_token")
    .eq("connector_id", connectorId)
    .eq("user_id", user.id)
    .maybeSingle()
  const cfg = row ? resolveUserConnectionConfig(row, user.id) : null
  if (!cfg || !row) return NextResponse.json({ error: "연결을 찾을 수 없어요." }, { status: 404 })
  const rowId = row.id

  try {
    const tools = await summarizeToolsKo(cfg.name, await discoverMcpTools(cfg))
    await supabase
      .from("mcp_user_connections")
      .update({ last_tested_at: new Date().toISOString(), last_test_ok: true, last_test_error: null, tools })
      .eq("id", rowId)
    return NextResponse.json({ ok: true, tools })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "연결 실패"
    await supabase
      .from("mcp_user_connections")
      .update({ last_tested_at: new Date().toISOString(), last_test_ok: false, last_test_error: msg })
      .eq("id", rowId)
    return NextResponse.json({ ok: false, error: msg })
  }
}
