import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { discoverMcpTools, resolveUserConnectionConfig } from "@/lib/mcp/connect"
import { summarizeToolsKo } from "@/lib/mcp/summarize"
import { MCP_CONNECTORS, credentialKeyFor } from "@/lib/mcp"
import { decryptToken } from "@/lib/google/crypto"

export const runtime = "nodejs"
export const maxDuration = 60

/** 개인 연결 재테스트 — 본인 것만(RLS). bearer·oauth 공용(resolveUserConnectionConfig가 분기).
 *  구글 커넥터는 도구 목록만으론 부족(동의 화면 체크박스를 안 켜면 "연결 성공·권한 없음" 상태가 됨 —
 *  2026-07-28 대표 실사용에서 발견) → 토큰에 실제 스코프가 붙었는지 tokeninfo로 추가 검사. */
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

    // 구글 스코프 검사 — 부여 안 됐으면 "실패한 연결"로 기록(사용자 관점: 도구가 전부 403이므로)
    const connector = MCP_CONNECTORS.find((c) => c.id === connectorId)
    let scopeOk: boolean | null = null
    if (connector?.oauthScope && credentialKeyFor(connector) === "google" && row.encrypted_token) {
      try {
        const at = decryptToken(row.encrypted_token)
        const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(at)}`)
        if (r.ok) {
          const info = (await r.json()) as { scope?: string }
          scopeOk = (info.scope ?? "").split(" ").includes(connector.oauthScope)
        }
      } catch {
        /* 진단 자체가 실패하면 판단 보류(scopeOk=null) — 연결 성패엔 영향 없음 */
      }
    }

    if (scopeOk === false) {
      const msg =
        "구글 권한이 부여되지 않았어요 — 연결을 해제하고 다시 연결하면서 동의 화면의 권한 체크박스를 꼭 켜 주세요."
      await supabase
        .from("mcp_user_connections")
        .update({ last_tested_at: new Date().toISOString(), last_test_ok: false, last_test_error: msg, tools })
        .eq("id", rowId)
      return NextResponse.json({ ok: false, scopeOk: false, error: msg, tools })
    }

    await supabase
      .from("mcp_user_connections")
      .update({ last_tested_at: new Date().toISOString(), last_test_ok: true, last_test_error: null, tools })
      .eq("id", rowId)
    return NextResponse.json({ ok: true, scopeOk, tools })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "연결 실패"
    await supabase
      .from("mcp_user_connections")
      .update({ last_tested_at: new Date().toISOString(), last_test_ok: false, last_test_error: msg })
      .eq("id", rowId)
    return NextResponse.json({ ok: false, error: msg })
  }
}
