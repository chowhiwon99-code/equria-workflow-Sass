import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { MCP_CONNECTORS, appCredentialGroups } from "@/lib/mcp"
import { oauthRedirectUrl } from "@/lib/mcp/oauth"

export const runtime = "nodejs"

/** 내가 이 워크스페이스 오너(대표)인지 — 크리덴셜 등록/삭제는 오너 전용. */
async function isOwner(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin.from("workspaces").select("id").eq("owner_id", userId).limit(1).maybeSingle()
  return !!data
}

/** MCP 앱 크리덴셜 그룹 현황.
 *  - configured(설정됨 여부)는 모든 로그인 사용자에게 노출 → McpView 카드 게이팅용(민감정보 아님).
 *  - client_id·secret 유무 상세는 오너에게만(secret 값 자체는 절대 반환하지 않음). */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const owner = await isOwner(user.id)
  const admin = createAdminClient()
  const { data: rows } = await admin.from("mcp_oauth_clients").select("connector_id, client_id, client_secret, is_static")
  const byKey = new Map((rows ?? []).map((r) => [r.connector_id, r]))

  const groups = appCredentialGroups().map((g) => {
    const row = byKey.get(g.key)
    const connectorNames = g.connectorIds
      .map((id) => MCP_CONNECTORS.find((c) => c.id === id)?.name ?? id)
    return {
      key: g.key,
      label: g.label,
      help: g.help,
      setupUrl: g.setupUrl,
      connectorNames,
      redirectUris: g.connectorIds.map((id) => oauthRedirectUrl(id)),
      configured: !!row,
      // 오너에게만 상세(값이 아니라 유무·client_id만).
      ...(owner ? { clientId: row?.client_id ?? null, hasSecret: !!row?.client_secret } : {}),
    }
  })

  return NextResponse.json({ isOwner: owner, groups })
}

/** 크리덴셜 등록/수정(오너 전용) — is_static=true로 저장해 DCR 자가치유가 덮지 않게 한다. */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })
  if (!(await isOwner(user.id))) return new NextResponse("관리자(대표)만 설정할 수 있어요.", { status: 403 })

  const body = (await req.json().catch(() => ({}))) as {
    credentialKey?: string
    client_id?: string
    client_secret?: string
  }
  const key = body.credentialKey?.trim()
  const clientId = body.client_id?.trim()
  if (!key || !appCredentialGroups().some((g) => g.key === key)) {
    return NextResponse.json({ error: "알 수 없는 크리덴셜 그룹이에요." }, { status: 400 })
  }
  if (!clientId) {
    return NextResponse.json({ error: "client_id를 입력하세요." }, { status: 400 })
  }

  const admin = createAdminClient()
  // secret 보존: 입력하지 않으면(undefined) 기존 값을 유지, 값을 주면 교체(빈 문자열=삭제).
  const { data: existing } = await admin
    .from("mcp_oauth_clients")
    .select("client_secret")
    .eq("connector_id", key)
    .maybeSingle()
  const provided = typeof body.client_secret === "string" ? body.client_secret.trim() : undefined
  const secret = provided !== undefined ? provided || null : existing?.client_secret ?? null

  const { error } = await admin.from("mcp_oauth_clients").upsert(
    {
      connector_id: key,
      client_id: clientId,
      client_secret: secret,
      is_static: true,
      redirect_uri: null, // 정적 크리덴셜은 redirect_uri 자가치유를 건너뛰므로 저장 불필요.
    },
    { onConflict: "connector_id" }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** 크리덴셜 삭제(오너 전용). 기존 개인 연결은 남지만 재연결 전까지 실패한다. */
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })
  if (!(await isOwner(user.id))) return new NextResponse("관리자(대표)만 설정할 수 있어요.", { status: 403 })

  const key = new URL(req.url).searchParams.get("credentialKey")?.trim()
  if (!key) return NextResponse.json({ error: "credentialKey가 없어요." }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from("mcp_oauth_clients").delete().eq("connector_id", key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
