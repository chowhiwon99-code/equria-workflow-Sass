import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { ACTIVE_WS_COOKIE } from "@/lib/workspace-cookie"

// B1-b: 서버 라우트에서 "현재 사용자의 워크스페이스(회사) id"를 구한다.
// 클라이언트 컴포넌트의 useCurrentWorkspaceId()에 대응하는 서버측 소스.
// 단일 테넌트(equria)에선 멤버십이 1개 → 반환값이 기존 sentinel DEFAULT와 동일 → 동작 변화 0.

/** 플랫폼 운영자(우리) 워크스페이스 = equria sentinel. MCP 앱 크리덴셜 등 전역 공유 자원의 관리 게이트 기준. */
export const OPERATOR_WORKSPACE_ID = "00000000-0000-0000-0000-0000000000e1"

/** 현재 사용자의 쓰기 대상 워크스페이스 id. 활성 워크스페이스 쿠키(전환한 회사)를 우선하되
 *  "내 비게스트 멤버십"일 때만(스푸핑 방지) — 없으면 첫 비게스트 멤버십으로 폴백. 둘 다 없으면 null.
 *  B2 감사 V3(게스트 오귀속 방지)·V5(클라 활성 워크스페이스↔서버 불일치 해소). 단일 워크스페이스면 동작 변화 0. */
export async function getUserWorkspaceId(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  // 활성 워크스페이스 쿠키 우선 — 전환한 회사로 쓰기 귀속. 쿠키 컨텍스트 밖(테스트 등)이면 무시.
  let activeWs: string | undefined
  try {
    const { cookies } = await import("next/headers")
    activeWs = (await cookies()).get(ACTIVE_WS_COOKIE)?.value
  } catch {
    /* 쿠키 없는 컨텍스트 — 폴백으로 진행 */
  }
  if (activeWs) {
    const { data } = await client
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("workspace_id", activeWs)
      .neq("role", "guest")
      .maybeSingle()
    if (data?.workspace_id) return data.workspace_id
  }
  const { data } = await client
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .neq("role", "guest")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.workspace_id ?? null
}

/** 사용자가 플랫폼 운영자(equria 오너)인가 — 전역 공유 크리덴셜 관리 전용 게이트. */
export async function isPlatformOperator(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data } = await client
    .from("workspaces")
    .select("id")
    .eq("id", OPERATOR_WORKSPACE_ID)
    .eq("owner_id", userId)
    .maybeSingle()
  return !!data
}

/**
 * INSERT 페이로드에 workspace_id를 명시한다.
 * 마이그 112(DEFAULT 제거) 이후 workspace_id는 전 테이블 필수 — wsId가 null이면(이론상)
 * DB NOT NULL 위반으로 거부되는 것이 의도된 fail-closed 동작(조용한 오귀속보다 안전).
 */
export function withWorkspace<T extends object>(row: T, wsId: string | null): T & { workspace_id: string } {
  return { ...row, workspace_id: wsId as string }
}
