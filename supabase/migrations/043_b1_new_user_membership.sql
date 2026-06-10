-- 043: B1-a 회귀 수정 — 신규 가입자를 equria 워크스페이스 멤버로 자동 등록.
--
-- 문제(재검증에서 확인된 '시한폭탄'): B1에서 24개 테이블의 INSERT 정책을
--   is_workspace_member(workspace_id)로 바꿨는데, handle_new_user() 가입 트리거는
--   profiles만 만들고 workspace_members에는 안 넣는다. → 신규 가입자는 멤버가 아니라
--   첫 사용부터 모든 저장(대화·채팅·알림·자기채팅 등)이 RLS 42501로 거부된다.
--   (기존 5명은 마이그 030에서 일괄 등록돼 영향 없음 → 단일 테넌트에선 다음 가입 시 발현.)
-- 해결: handle_new_user()에 equria 멤버 등록을 추가(security definer라 RLS 우회·안전).
--   B2(초대 흐름) 도입 전까지 모든 신규 가입자는 기본 워크스페이스(equria)에 귀속.
-- 멱등(create or replace + on conflict do nothing).

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  -- 신규 가입자 → equria 워크스페이스 멤버(없으면 INSERT 정책에 막혀 아무것도 못 함)
  insert into public.workspace_members (workspace_id, user_id, role)
  values ('00000000-0000-0000-0000-0000000000e1', new.id, 'member')
  on conflict do nothing;
  return new;
end;
$function$;

-- 부수: agents_insert 심층방어 — created_by 검증 추가(wf_insert와 동일 패턴).
-- 앱(AgentBuilderForm)이 created_by=본인으로 넣으므로 회귀 없음. created_by 스푸핑 방지.
drop policy if exists "agents_insert" on public.agents;
create policy "agents_insert" on public.agents for insert
  with check ((select auth.uid()) = created_by and public.is_workspace_member(workspace_id));
