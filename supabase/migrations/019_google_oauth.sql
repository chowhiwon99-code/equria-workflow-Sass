-- 019: Google OAuth 실연동 준비.
--  (1) 토큰(access_token/refresh_token)을 클라이언트(anon/authenticated)가 못 읽게 컬럼 권한 정리.
--      → 기존 gc_select 정책이 토큰 컬럼까지 SELECT 허용하던 보안 갭 정정.
--      행 접근(본인 행)·비토큰 컬럼(is_active 등)은 계속 읽힘. 토큰 읽기는 서버(service_role) 전용.
--  (2) 토큰 쓰기는 콜백(service_role)만 → 클라이언트 write 정책 제거.
--  (3) 증분 동기화/토큰타입 컬럼 추가.
-- 토큰은 앱 레벨 AES-256-GCM 암호문으로 저장(평문 금지). 멱등.

alter table public.google_connections add column if not exists token_type text;
alter table public.google_connections add column if not exists last_history_id text;

-- 테이블 전체 SELECT 회수 후 비-토큰 컬럼만 재부여(컬럼 단위 권한). anon은 SELECT 불가(로그인 필요).
revoke select on public.google_connections from anon;
revoke select on public.google_connections from authenticated;
grant select (id, user_id, google_email, scopes, expires_at, is_active, token_type, last_history_id, created_at, updated_at)
  on public.google_connections to authenticated;

-- 쓰기는 콜백이 service_role(RLS 우회)로 처리 → 클라이언트 write 정책 제거(읽기 gc_select는 유지).
drop policy if exists "gc_insert" on public.google_connections;
drop policy if exists "gc_update" on public.google_connections;
drop policy if exists "gc_delete" on public.google_connections;
