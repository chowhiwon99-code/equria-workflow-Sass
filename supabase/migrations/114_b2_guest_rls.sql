-- 114: B2 — 게스트 RLS (설계: prancy-whistling-tome 플랜 B-2, 대표 결정 = 프로젝트 단위 게스트)
--
-- 전략(fail-closed): 핵심 헬퍼 2개(auth_user_workspace_ids·is_workspace_member)에서 guest를 제외
--   → 이 헬퍼를 쓰는 ~45개 테이블 정책이 한 번에 게스트 차단(기본 거부).
--   그 위에 "초대된 프로젝트" 경로만 명시적으로 개방(projects·project_tasks·project_members·프로젝트 첨부 files).
-- 기존 멤버 회귀 0: 전원 role in (owner,admin,member) → 헬퍼 결과 불변.
-- 롤백: 각 함수/정책을 원본 마이그(033·034·035·037·044·094) 본문으로 복원.

-- ── ① 핵심 헬퍼: guest 제외 (이 두 줄이 전 테이블 기본 차단) ──
create or replace function public.auth_user_workspace_ids()
returns setof uuid
language sql security definer stable set search_path = public as $$
  select workspace_id from public.workspace_members
  where user_id = (select auth.uid()) and role <> 'guest'
$$;

create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = (select auth.uid()) and role <> 'guest'
  )
$$;

-- ── ② 프로젝트 접근 헬퍼 (자기참조 RLS 재귀 회피용 definer) ──
create or replace function public.is_project_member(p_project uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project and pm.user_id = (select auth.uid())
  )
$$;

create or replace function public.can_access_project(p_project uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project
      and (p.workspace_id in (select public.auth_user_workspace_ids())
           or public.is_project_member(p.id))
  )
$$;

revoke execute on function public.is_project_member(uuid) from public, anon;
grant execute on function public.is_project_member(uuid) to authenticated;
revoke execute on function public.can_access_project(uuid) from public, anon;
grant execute on function public.can_access_project(uuid) to authenticated;

-- ── ③ projects: 게스트는 초대된 프로젝트만 열람 (035 원문 + project_members OR) ──
drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects for select
  using (workspace_id in (select public.auth_user_workspace_ids())
         or public.is_project_member(id));

-- ── ④ project_tasks(094 4정책): 부모 EXISTS → can_access_project(게스트도 체크 협업) ──
drop policy if exists "project_task_select" on public.project_tasks;
create policy "project_task_select" on public.project_tasks for select
  using (public.can_access_project(project_id));
drop policy if exists "project_task_insert" on public.project_tasks;
create policy "project_task_insert" on public.project_tasks for insert
  with check (public.can_access_project(project_id));
drop policy if exists "project_task_update" on public.project_tasks;
create policy "project_task_update" on public.project_tasks for update
  using (public.can_access_project(project_id));
drop policy if exists "project_task_delete" on public.project_tasks;
create policy "project_task_delete" on public.project_tasks for delete
  using (public.can_access_project(project_id));

-- ── ⑤ project_members: 같은 프로젝트 멤버 목록 열람 (035 원문 + OR) ──
drop policy if exists "pm_select" on public.project_members;
create policy "pm_select" on public.project_members for select
  using (workspace_id in (select public.auth_user_workspace_ids())
         or public.is_project_member(project_id));

-- ── ⑥ files: 게스트는 "초대된 프로젝트의 공개 첨부"만 (044 원문 + 게스트 경로 OR) ──
drop policy if exists "files_select" on public.files;
create policy "files_select" on public.files for select using (
  (
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
  )
  or (
    files.project_id is not null
    and files.visibility = 'public'
    and public.is_project_member(files.project_id)
  )
);

-- ── ⑦ profiles 가시성(034 헬퍼 재작성): 정식 멤버끼리 or 같은 프로젝트 동료 ──
--    게스트 ↔ 전체 직원 디렉터리 상호 차단, 프로젝트 동료끼리만 이름·아바타 노출.
create or replace function public.shares_workspace_with(other_user uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.workspace_members wm_me
    join public.workspace_members wm_them on wm_them.workspace_id = wm_me.workspace_id
    where wm_me.user_id = (select auth.uid()) and wm_them.user_id = other_user
      and wm_me.role <> 'guest' and wm_them.role <> 'guest'
  )
  or exists (
    select 1
    from public.project_members a
    join public.project_members b on b.project_id = a.project_id
    where a.user_id = (select auth.uid()) and b.user_id = other_user
  )
$$;

-- ── ⑧ notifications: 자기 행 한정으로 완화 (037이 헬퍼 의존이라 게스트 알림이 두절되는 것 방지) ──
--    user_id = 본인 조건만으로도 안전(남의 알림 접근 불가).
drop policy if exists "notif_select" on public.notifications;
create policy "notif_select" on public.notifications for select
  using ((select auth.uid()) = user_id);
drop policy if exists "notif_update" on public.notifications;
create policy "notif_update" on public.notifications for update
  using ((select auth.uid()) = user_id);
