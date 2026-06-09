-- 035: B1-a 읽기 격리 — '완전개방 SELECT' 데이터 테이블 7종을 워크스페이스 격리.
--
-- 대상(현재 SELECT='auth.uid() is not null' → 로그인만 하면 전사 노출 = 핵심 누출):
--   calendar_events · finance_entries · tax_invoices · business_cards · files · projects · project_members
-- 원칙: 기존 소유자/작성자 조건(created_by/owner_id, project owner 등)은 그대로 보존하고,
--   workspace_id 격리를 AND로 한 겹 더 씌운다. is_public 류 없음.
--   SELECT = 내 워크스페이스 행만. INSERT = 내 워크스페이스에만(is_workspace_member). UPDATE/DELETE = 기존 소유 AND 내 워크스페이스.
-- 단일 테넌트(equria) 현 상태: 모든 데이터가 equria, 사용자도 equria 멤버 → 회귀 없음. 누출만 차단.
-- 헬퍼: 033의 auth_user_workspace_ids()(SELECT/UPDATE/DELETE), is_workspace_member()(INSERT).
-- 멱등: drop policy if exists. 되돌리기: 이전 정책(주석) 복원.

-- ── calendar_events (이전: select/insert='uid not null', update/delete=created_by=uid) ──
drop policy if exists "cal_select" on public.calendar_events;
create policy "cal_select" on public.calendar_events for select
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "cal_insert" on public.calendar_events;
create policy "cal_insert" on public.calendar_events for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "cal_update" on public.calendar_events;
create policy "cal_update" on public.calendar_events for update
  using (created_by = (select auth.uid()) and workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "cal_delete" on public.calendar_events;
create policy "cal_delete" on public.calendar_events for delete
  using (created_by = (select auth.uid()) and workspace_id in (select public.auth_user_workspace_ids()));

-- ── finance_entries (이전: 모든 op='uid not null' — 완전개방) ──
drop policy if exists "fin_select" on public.finance_entries;
create policy "fin_select" on public.finance_entries for select
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "fin_insert" on public.finance_entries;
create policy "fin_insert" on public.finance_entries for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "fin_update" on public.finance_entries;
create policy "fin_update" on public.finance_entries for update
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "fin_delete" on public.finance_entries;
create policy "fin_delete" on public.finance_entries for delete
  using (workspace_id in (select public.auth_user_workspace_ids()));

-- ── tax_invoices (이전: select/insert='uid not null', update/delete=created_by=uid) ──
drop policy if exists "tax_select" on public.tax_invoices;
create policy "tax_select" on public.tax_invoices for select
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "tax_insert" on public.tax_invoices;
create policy "tax_insert" on public.tax_invoices for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "tax_update" on public.tax_invoices;
create policy "tax_update" on public.tax_invoices for update
  using (created_by = (select auth.uid()) and workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "tax_delete" on public.tax_invoices;
create policy "tax_delete" on public.tax_invoices for delete
  using (created_by = (select auth.uid()) and workspace_id in (select public.auth_user_workspace_ids()));

-- ── business_cards (이전: select='uid not null', insert/update/delete=owner_id=uid) ──
drop policy if exists "card_select" on public.business_cards;
create policy "card_select" on public.business_cards for select
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "card_insert" on public.business_cards;
create policy "card_insert" on public.business_cards for insert
  with check (owner_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
drop policy if exists "card_update" on public.business_cards;
create policy "card_update" on public.business_cards for update
  using (owner_id = (select auth.uid()) and workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "card_delete" on public.business_cards;
create policy "card_delete" on public.business_cards for delete
  using (owner_id = (select auth.uid()) and workspace_id in (select public.auth_user_workspace_ids()));

-- ── files (이전: select/insert='uid not null', update/delete=owner_id=uid) ──
drop policy if exists "files_select" on public.files;
create policy "files_select" on public.files for select
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "files_insert" on public.files;
create policy "files_insert" on public.files for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "files_update" on public.files;
create policy "files_update" on public.files for update
  using (owner_id = (select auth.uid()) and workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "files_delete" on public.files;
create policy "files_delete" on public.files for delete
  using (owner_id = (select auth.uid()) and workspace_id in (select public.auth_user_workspace_ids()));

-- ── projects (이전: select/insert='uid not null', update=created_by|owner_id, delete=created_by) ──
drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects for select
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects for update
  using (((select auth.uid()) = created_by or (select auth.uid()) = owner_id)
         and workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "projects_delete" on public.projects;
create policy "projects_delete" on public.projects for delete
  using ((select auth.uid()) = created_by and workspace_id in (select public.auth_user_workspace_ids()));

-- ── project_members (이전: select='uid not null', insert/delete=EXISTS project owner/creator) ──
drop policy if exists "pm_select" on public.project_members;
create policy "pm_select" on public.project_members for select
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "pm_insert" on public.project_members;
create policy "pm_insert" on public.project_members for insert
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and ((select auth.uid()) = p.created_by or (select auth.uid()) = p.owner_id)
    )
  );
drop policy if exists "pm_delete" on public.project_members;
create policy "pm_delete" on public.project_members for delete
  using (
    workspace_id in (select public.auth_user_workspace_ids())
    and exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and ((select auth.uid()) = p.created_by or (select auth.uid()) = p.owner_id)
    )
  );
