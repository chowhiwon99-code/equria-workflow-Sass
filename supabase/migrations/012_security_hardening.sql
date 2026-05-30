-- 012_security_hardening.sql
-- Supabase Security Advisor WARN 해소:
--   ① function_search_path_mutable: SECURITY DEFINER 함수에 search_path 미설정 → 주입 위험
--   ② anon/authenticated_security_definer_function_executable: 트리거 전용 함수가 RPC로 노출
-- 모든 대상 함수 본문은 public 객체를 스키마 한정 참조 → search_path='' 안전(pg_catalog는 암묵 포함).

-- ① search_path 고정 (본문 미수정, ALTER 만)
alter function public.handle_new_user()                       set search_path = '';
alter function public.handle_new_agent_version()              set search_path = '';
alter function public.get_or_create_direct_conversation(uuid) set search_path = '';
alter function public.touch_direct_conversation()             set search_path = '';
alter function public.handle_new_dm()                         set search_path = '';
alter function public.handle_event_done()                     set search_path = '';
alter function public.handle_project_assigned()               set search_path = '';

-- ② 트리거 전용 함수: 외부 RPC 실행 차단 (트리거 자체 동작엔 영향 없음)
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.handle_new_agent_version() from public, anon, authenticated;
revoke execute on function public.touch_direct_conversation() from public, anon, authenticated;
revoke execute on function public.handle_new_dm()           from public, anon, authenticated;
revoke execute on function public.handle_event_done()       from public, anon, authenticated;
revoke execute on function public.handle_project_assigned() from public, anon, authenticated;

-- ③ 정상 RPC: anon 차단, 로그인 사용자(authenticated)만 허용
revoke execute on function public.get_or_create_direct_conversation(uuid) from public, anon;
grant  execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
revoke execute on function public.mark_dm_read(uuid) from public, anon;
grant  execute on function public.mark_dm_read(uuid) to authenticated;
