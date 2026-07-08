import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { discoverMcpTools } from "@/lib/mcp/connect"

export const runtime = "nodejs"
export const maxDuration = 60

/** MCP 서버 연결 테스트 — 연결→도구 목록 발견→캐시(mcp_tools) 갱신→last_test 기록. 관리자만. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (prof?.role !== "admin") {
    return NextResponse.json({ error: "관리자만 가능해요." }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: server } = await admin
    .from("mcp_servers")
    .select("id, name, type, url, auth_type, encrypted_token")
    .eq("id", id)
    .maybeSingle()
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없어요." }, { status: 404 })

  try {
    const tools = await discoverMcpTools(server)

    // 도구 캐시 갱신(기존 삭제 → 재삽입)
    await admin.from("mcp_tools").delete().eq("server_id", id)
    if (tools.length > 0) {
      await admin.from("mcp_tools").insert(
        tools.map((t) => ({
          server_id: id,
          name: t.name,
          description: t.description || null,
          input_schema: {},
          enabled: true,
        }))
      )
    }
    await admin
      .from("mcp_servers")
      .update({ last_tested_at: new Date().toISOString(), last_test_ok: true, last_test_error: null })
      .eq("id", id)

    return NextResponse.json({ ok: true, tools })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "연결 실패"
    await admin
      .from("mcp_servers")
      .update({ last_tested_at: new Date().toISOString(), last_test_ok: false, last_test_error: msg })
      .eq("id", id)
    // 테스트 실패는 정상 응답(200)으로 메시지 전달
    return NextResponse.json({ ok: false, error: msg })
  }
}
