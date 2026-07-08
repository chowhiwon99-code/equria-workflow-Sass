import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"
import { encryptToken } from "@/lib/google/crypto"

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
  // 유저 스코프(RLS) 클라이언트로 반환 — mcp_admin 정책이 "관리자 AND 내 워크스페이스"를 강제(타 회사 MCP 변경 차단·H1).
  return { db: supabase }
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
    token?: string
  }
  const patch: McpUpdate = {}
  if (typeof body.name === "string") patch.name = body.name.trim()
  if (body.type === "http" || body.type === "sse") patch.type = body.type
  if (typeof body.url === "string") patch.url = body.url.trim()
  if (body.auth_type === "none" || body.auth_type === "bearer") patch.auth_type = body.auth_type
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active
  // 토큰이 오면 암호화해 갱신(빈 값은 무시 — 기존 토큰 유지).
  if (typeof body.token === "string" && body.token.trim()) patch.encrypted_token = encryptToken(body.token.trim())

  const { data, error } = await gate.db
    .from("mcp_servers")
    .update(patch)
    .eq("id", id)
    .select("id")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // RLS로 막힌 타 워크스페이스 대상은 0행 갱신(에러 없음) → 404로 명확히 처리.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "MCP 서버를 찾을 수 없거나 권한이 없어요." }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

/** MCP 서버 삭제 (관리자). mcp_tools는 FK cascade로 함께 삭제. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const { data, error } = await gate.db
    .from("mcp_servers")
    .delete()
    .eq("id", id)
    .select("id")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "MCP 서버를 찾을 수 없거나 권한이 없어요." }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
