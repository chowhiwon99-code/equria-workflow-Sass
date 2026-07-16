import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { encryptToken } from "@/lib/google/crypto"
import { discoverMcpTools } from "@/lib/mcp/connect"
import { summarizeToolsKo } from "@/lib/mcp/summarize"
import { MCP_CONNECTORS } from "@/lib/mcp"

export const runtime = "nodejs"
export const maxDuration = 60

/** 내 MCP 개인 연결 목록 — 회사 공용 mcp_servers와 별개(RLS로 본인 것만 조회됨). */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { data } = await supabase
    .from("mcp_user_connections")
    .select("id, connector_id, last_tested_at, last_test_ok, last_test_error, tools")
    .order("created_at", { ascending: true })

  return NextResponse.json({ connections: data ?? [] })
}

/** 개인 커넥터 연결(토큰 등록) — 관리자 게이트 없음, 본인 계정은 누구나 스스로 연결. 등록 직후 자동 테스트. */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { connector_id?: string; token?: string }
  const connector = MCP_CONNECTORS.find((c) => c.id === body.connector_id)
  if (!connector?.preset || connector.preset.auth !== "bearer") {
    return NextResponse.json({ error: "지원하지 않는 커넥터예요." }, { status: 400 })
  }
  if (!body.token?.trim()) {
    return NextResponse.json({ error: "토큰을 입력하세요." }, { status: 400 })
  }

  const encrypted_token = encryptToken(body.token.trim())
  // RLS(auth.uid()=user_id)로 본인 행만 upsert 가능 — 유저 스코프 클라이언트로 충분(admin 불필요).
  const { data, error } = await supabase
    .from("mcp_user_connections")
    .upsert(
      {
        user_id: user.id,
        connector_id: connector.id,
        encrypted_token,
        last_tested_at: null,
        last_test_ok: null,
        last_test_error: null,
        tools: [],
      },
      { onConflict: "user_id,connector_id" }
    )
    .select("id")
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? "등록에 실패했어요." }, { status: 500 })

  try {
    const tools = await summarizeToolsKo(
      connector.name,
      await discoverMcpTools({
        id: data.id,
        name: connector.name,
        type: connector.preset.type,
        url: connector.preset.url,
        auth_type: "bearer",
        encrypted_token,
      })
    )
    await supabase
      .from("mcp_user_connections")
      .update({ last_tested_at: new Date().toISOString(), last_test_ok: true, last_test_error: null, tools })
      .eq("id", data.id)
    return NextResponse.json({ ok: true, id: data.id, tools })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "연결 실패"
    await supabase
      .from("mcp_user_connections")
      .update({ last_tested_at: new Date().toISOString(), last_test_ok: false, last_test_error: msg })
      .eq("id", data.id)
    // 등록 자체는 성공(토큰 저장됨) — 테스트만 실패, 프론트가 사유 표시.
    return NextResponse.json({ ok: false, id: data.id, error: msg })
  }
}
