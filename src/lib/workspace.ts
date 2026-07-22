import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

// B1-b: 서버 라우트에서 "현재 사용자의 워크스페이스(회사) id"를 구한다.
// 클라이언트 컴포넌트의 useCurrentWorkspaceId()에 대응하는 서버측 소스.
// 단일 테넌트(equria)에선 멤버십이 1개 → 반환값이 기존 sentinel DEFAULT와 동일 → 동작 변화 0.

/** 현재 사용자의 워크스페이스 id(첫 멤버십). 멤버십 없으면 null → 호출부는 값이 있을 때만 명시. */
export async function getUserWorkspaceId(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data } = await client
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.workspace_id ?? null
}

/**
 * INSERT 페이로드에 workspace_id를 안전하게 덧붙인다.
 * wsId가 있으면 명시, null이면 필드를 아예 넣지 않아 컬럼 DEFAULT가 적용되게 한다
 * (null을 직접 넣으면 NOT NULL 위반이 되므로 "생략"이 정답).
 */
export function withWorkspace<T extends object>(row: T, wsId: string | null): T & { workspace_id?: string } {
  return wsId ? { ...row, workspace_id: wsId } : row
}
