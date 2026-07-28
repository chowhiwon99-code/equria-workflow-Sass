import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

// B1-b: 서버 라우트에서 "현재 사용자의 워크스페이스(회사) id"를 구한다.
// 클라이언트 컴포넌트의 useCurrentWorkspaceId()에 대응하는 서버측 소스.
// 단일 테넌트(equria)에선 멤버십이 1개 → 반환값이 기존 sentinel DEFAULT와 동일 → 동작 변화 0.

/** 플랫폼 운영자(우리) 워크스페이스 = equria sentinel. MCP 앱 크리덴셜 등 전역 공유 자원의 관리 게이트 기준. */
export const OPERATOR_WORKSPACE_ID = "00000000-0000-0000-0000-0000000000e1"

/** 현재 사용자의 정식 멤버십 워크스페이스 id(첫 멤버십). 게스트 멤버십은 제외(게스트는 쓰기 자원 귀속 대상이 아님 —
 *  B2 감사 V3: 게스트가 호스트 워크스페이스에 오귀속되어 예산 소진하는 것 방지). 없으면 null → 호출부가 값 있을 때만 명시. */
export async function getUserWorkspaceId(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
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
