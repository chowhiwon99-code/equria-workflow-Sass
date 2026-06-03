import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

/** 등록된 MCP 서버 목록 + 서버별 캐시된 도구. (RLS: 인증자 읽기) */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const [{ data: servers }, { data: tools }] = await Promise.all([
    supabase
      .from("mcp_servers")
      .select("id, name, type, url, is_active, auth_type, last_tested_at, last_test_ok, last_test_error")
      .order("created_at", { ascending: true }),
    supabase.from("mcp_tools").select("server_id, name, description"),
  ])

  const toolsByServer: Record<string, { name: string; description: string | null }[]> = {}
  for (const t of tools ?? []) {
    ;(toolsByServer[t.server_id] ??= []).push({ name: t.name, description: t.description })
  }

  return NextResponse.json({ servers: servers ?? [], tools: toolsByServer })
}

/** MCP 서버 등록 (관리자만). type=http(권장)/sse, auth=none/bearer(토큰은 env MCP_<NAME>_TOKEN). */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (prof?.role !== "admin") {
    return NextResponse.json({ error: "MCP 서버 등록은 관리자만 가능해요." }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    type?: string
    url?: string
    auth_type?: string
  }
  if (!body.name?.trim() || !body.url?.trim()) {
    return NextResponse.json({ error: "이름과 URL을 입력하세요." }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("mcp_servers")
    .insert({
      name: body.name.trim(),
      type: body.type === "sse" ? "sse" : "http",
      url: body.url.trim(),
      auth_type: body.auth_type === "bearer" ? "bearer" : "none",
      is_active: true,
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}
