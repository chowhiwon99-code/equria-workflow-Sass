-- 044: 파일 공개범위(개인/부서/공개) — files에 visibility·department + RLS 시각별 격리.
--
-- 배경: 현재 files_select(035)는 "워크스페이스 전체 읽기" 허용이고, FilesView 앱은 owner만 보여줌.
--   → '개인 파일'을 진짜 비공개로 만들려면 RLS가 visibility를 강제해야 한다.
-- 기본값 'public' + 기존 행 백필 → 기존 파일·프로젝트 첨부 파일은 전부 공개 유지 = 회귀 0.
-- 멱등(add column if not exists / drop policy if exists / create or replace).

-- 1) 컬럼: visibility(개인/부서/공개) + department(부서 공개 시 그 부서). 기존 행은 NOT NULL DEFAULT로 'public' 백필.
alter table public.files
  add column if not exists visibility text not null default 'public'
    check (visibility in ('personal', 'department', 'public')),
  add column if not exists department text;

-- 2) 헬퍼: 현재 사용자의 부서(profiles.department). security definer stable → RLS에서 캐싱·안전.
create or replace function public.auth_user_department()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select department from public.profiles where id = (select auth.uid())
$$;
grant execute on function public.auth_user_department() to authenticated;

-- 3) files_select 재작성: 워크스페이스 격리 + 시각별 가시성.
--    본인 파일은 항상 / 공개는 워크스페이스 전체 / 부서는 같은 부서만.
drop policy if exists "files_select" on public.files;
create policy "files_select" on public.files for select using (
  workspace_id in (select public.auth_user_workspace_ids())
  and (
    owner_id = (select auth.uid())
    or visibility = 'public'
    or (
      visibility = 'department'
      and department is not null
      and department = public.auth_user_department()
    )
  )
);

-- insert/update/delete 정책은 변경 없음(035: 소유자 + is_workspace_member). 앱이 visibility·department를 채운다.
