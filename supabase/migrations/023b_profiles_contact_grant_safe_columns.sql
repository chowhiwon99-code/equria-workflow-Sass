-- 023b: 023(컬럼 단위 REVOKE)이 무효였던 것 정정 — 연락처 프라이버시 실제 강제.
--   원인: profiles 에 "테이블 단위" SELECT 권한이 남아 있어 컬럼 단위 REVOKE를 덮어썼다(Postgres 동작).
--   해결: 테이블 SELECT 를 회수하고, 민감 3컬럼(email/work_phone/mobile)을 제외한 컬럼만 다시 GRANT.
--   민감 컬럼은 directory_contact(target) RPC(SECURITY DEFINER, 소유자 권한 실행)로만 노출되며,
--   본인/관리자도 동일 RPC의 self/admin 분기로 받는다. service_role/postgres 는 회수 대상 아님.
--   멱등: revoke/grant 반복 실행 안전.

revoke select on public.profiles from authenticated, anon;
grant select (id, name, role, department, avatar_url, created_at, updated_at, status_manual, position, contact_privacy)
  on public.profiles to authenticated, anon;
