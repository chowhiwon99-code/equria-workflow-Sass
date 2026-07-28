// 활성 워크스페이스 쿠키 — 워크스페이스 전환의 SSOT. 클라(전환 시 세팅)와 서버(읽기)가 공유.
// RLS 헬퍼 auth_user_workspace_ids()가 이 값을 x-workspace-id 헤더로 받아 읽기를 활성 회사로 스코프.
export const ACTIVE_WS_COOKIE = "complow-active-ws"

/** 브라우저 document.cookie에서 활성 워크스페이스 id 읽기(클라 Supabase 팩토리용). */
export function readActiveWsCookie(): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(/(?:^|;\s*)complow-active-ws=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/** 활성 워크스페이스 쿠키 세팅(1년·SameSite=Lax). 전환 시 클라에서 호출 후 새로고침. */
export function writeActiveWsCookie(id: string): void {
  if (typeof document === "undefined") return
  document.cookie = `${ACTIVE_WS_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`
}

/** 활성 워크스페이스 쿠키 제거 — 로그아웃 시 호출(공용 PC에서 다음 사용자에게 스코프 잔존 방지). */
export function clearActiveWsCookie(): void {
  if (typeof document === "undefined") return
  document.cookie = `${ACTIVE_WS_COOKIE}=; path=/; max-age=0; samesite=lax`
}
