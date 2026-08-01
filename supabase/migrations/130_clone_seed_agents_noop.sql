-- 130: 기본 에이전트 clean-slate — 신규 워크스페이스는 옛 시드 8종을 복제하지 않는다.
--
-- 배경: 옛 기본 8종(세금계산서·CS·번역·문서·데이터·법무·SNS·Higgsfield)은 세션33 RETIRED 유물로
--   앱 데이터를 못 읽는 "혼자 글쓰기 도우미"다. 범용 비서 '컴피'(대시보드 내장·api/assistant)가 대체한다.
--   create_workspace(온보딩)가 호출하는 clone_seed_agents를 no-op로 만들어 신규 회사는 빈 에이전트
--   목록으로 시작(각자 필요한 에이전트를 직접 생성 + 컴피).
-- 기존 워크스페이스의 시드 에이전트는 이 마이그에서 건드리지 않는다(별도 결정 — 되돌림 쉬운 is_active 토글).
-- 멱등(create or replace). 롤백 = 마이그115의 clone_seed_agents 본문 복원.

create or replace function public.clone_seed_agents(target_ws uuid)
returns int
language plpgsql security definer set search_path = public as $$
begin
  -- clean-slate: 신규 워크스페이스는 시드 에이전트 없이 시작(컴피가 범용 비서). 복제하지 않음.
  return 0;
end $$;
revoke execute on function public.clone_seed_agents(uuid) from public, anon, authenticated;
