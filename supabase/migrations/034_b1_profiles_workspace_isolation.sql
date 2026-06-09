-- 034: B1-a 읽기 격리 — profiles(전역 테이블) 워크스페이스 가시성 제한.
--
-- 문제: profiles는 workspace_id 컬럼이 없는 전역 테이블(auth.users 1:1)인데,
--       현재 profiles_select = 'auth.uid() is not null' → 누구나 전사(타 회사 포함) 직원
--       명단·이름·아바타 조회 가능(레드팀 #3, high — PII 누출).
-- 해결: "본인 + 나와 같은 워크스페이스를 공유하는 동료"만 보이게.
--       workspace_members에 RLS(본인 행만)가 걸려 있어 정책 내부 서브쿼리로는 '상대의 멤버십'을
--       읽을 수 없다 → security definer 헬퍼 shares_workspace_with()로 우회(본인 기준으로만 계산).
--
-- 단일 테넌트(equria) 현 상태에선 전원이 같은 워크스페이스라 서로 그대로 보임 = 회귀 없음.
-- 되돌리기 = 이전 정책(주석 보존) 복원. 멱등(drop policy if exists / create or replace).

-- 두 사용자가 워크스페이스를 하나라도 공유하는가 (호출자=auth.uid() 기준).
-- security definer: workspace_members RLS를 우회해 '상대의 멤버십'까지 읽되, 한쪽은 항상 본인으로 고정.
create or replace function public.shares_workspace_with(other_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm_me
    join public.workspace_members wm_them on wm_them.workspace_id = wm_me.workspace_id
    where wm_me.user_id = (select auth.uid())
      and wm_them.user_id = other_user
  )
$$;
grant execute on function public.shares_workspace_with(uuid) to authenticated;

-- 이전: create policy "profiles_select" ... using (auth.uid() is not null)
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    id = (select auth.uid())                       -- 본인은 항상
    or public.shares_workspace_with(id)            -- 같은 워크스페이스 동료만
  );

-- profiles_insert / profiles_update 는 변경 없음(기존 'auth.uid() = id' 유지 = 자기 프로필만).
