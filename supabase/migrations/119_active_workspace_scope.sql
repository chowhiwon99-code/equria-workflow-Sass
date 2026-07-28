-- 119: 워크스페이스 전환 — 읽기 스코핑(활성 워크스페이스 헤더) [감사 V5 완결]
--
-- 문제: auth_user_workspace_ids()가 "내 전(비게스트) 워크스페이스 UNION"을 반환 → 한 사람이
--   2개 회사에 속하면 모든 목록(재무·채팅·프로젝트…)이 두 회사 것이 섞여 보인다(노션식 분리 안 됨).
-- 해결: PostgREST가 노출하는 request.headers의 x-workspace-id(클라/서버 Supabase 클라이언트가
--   활성 워크스페이스 쿠키에서 주입)를 읽어, 유효한 내 워크스페이스면 그 하나로 스코프한다.
--   ~45개 테이블 SELECT 정책이 이 헬퍼를 쓰므로 정책 무변경으로 전 화면이 활성 회사만 표시.
-- 안전: 헤더가 (a)없음 (b)내가 아닌 워크스페이스(스푸핑) (c)형식 오류 → 전부 "내 전체 멤버십"으로
--   폴백(내가 아닌 회사는 절대 노출 안 됨). 단일 워크스페이스 유저는 동작 변화 0. DB 시뮬 5종 통과.
-- is_workspace_member(ws_id)는 무변경 — 특정 ws 멤버십 검사(INSERT with check)는 활성과 무관해야 정합.
-- 롤백: 114의 auth_user_workspace_ids 원문(헤더 무시·전체 반환)으로 복원.

create or replace function public.auth_user_workspace_ids()
returns setof uuid
language sql security definer stable set search_path = public as $$
  with active as (
    select case
      when raw ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then raw::uuid else null end as ws
    from (select nullif(current_setting('request.headers', true)::json ->> 'x-workspace-id', '') as raw) h
  )
  select wm.workspace_id
  from public.workspace_members wm
  where wm.user_id = (select auth.uid())
    and wm.role <> 'guest'
    and (
      (select ws from active) is null
      or wm.workspace_id = (select ws from active)
      -- 헤더가 내 워크스페이스가 아니면(스푸핑·오타) 전체로 폴백 — 남의 회사는 노출 불가
      or not exists (
        select 1 from public.workspace_members m
        where m.user_id = (select auth.uid()) and m.role <> 'guest'
          and m.workspace_id = (select ws from active)
      )
    )
$$;
