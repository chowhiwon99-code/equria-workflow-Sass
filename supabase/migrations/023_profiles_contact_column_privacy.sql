-- 023: 연락처 컬럼 단위 프라이버시 강제.
--   profiles.email / work_phone / mobile 은 directory_contact(target) RPC(SECURITY DEFINER)로만 노출한다.
--   RLS는 "행 단위"라 특정 컬럼만 차단할 수 없다 → authenticated/anon의 해당 컬럼 SELECT 권한을 회수.
--   directory_contact 는 정의자(소유자) 권한으로 실행되므로 회수 후에도 계속 공개항목을 반환한다.
--   본인/관리자 노출도 RPC의 self/admin 분기로 처리(SettingsView·MyPageView는 본인 연락처를 RPC로 읽도록 변경).
--   service_role/postgres 는 회수 대상 아님 — 서버·관리 작업 그대로.
--   멱등: REVOKE 는 반복 실행해도 안전(이미 회수된 권한 회수는 no-op).
--   ⚠️ 단독으론 무효 — profiles 에 "테이블 단위" SELECT 권한이 남아 있어 컬럼 회수를 덮어쓴다.
--      실제 강제는 023b(테이블 SELECT 회수 + 안전 컬럼만 재GRANT)에서 완성됨.

revoke select (email, work_phone, mobile) on public.profiles from authenticated;
revoke select (email, work_phone, mobile) on public.profiles from anon;
