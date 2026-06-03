import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/types"

export const runtime = "nodejs"

type McpUpdate = Database["public"]["Tables"]["mcp_servers"]["Update"]

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: new NextResponse("Unauthorized", { status: 401 }) }
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (prof?.role !== "admin") {
    return { error: NextResponse.json({ error: "관리자만 가능해요." }, { status: 403 }) }
  }
  return { admin: createAdminClient() }
}

/** MCP 서버 수정 (관리자). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    type?: string
    url?: string
    auth_type?: string
    is_active?: boolean
  }
  const patch: McpUpdate = {}
  if (typeof body.name === "string") patch.name = body.name.trim()
  if (body.type === "http" || body.type === "sse") patch.type = body.type
  if (typeof body.url === "string") patch.url = body.url.trim()
  if (body.auth_type === "none" || body.auth_type === "bearer") patch.auth_type = body.auth_type
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active

  const { error } = await gate.admin.from("mcp_servers").update(patch).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** MCP 서버 삭제 (관리자). mcp_tools는 FK cascade로 함께 삭제. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const { error } = await gate.admin.from("mcp_servers").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
