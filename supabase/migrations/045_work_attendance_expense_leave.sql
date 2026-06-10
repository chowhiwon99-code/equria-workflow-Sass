-- 045: 업무 통합 — 근태(attendance_records)·지출결의서(expense_reports)·휴가(leave_requests).
--
-- B1 멀티테넌시 패턴 준수: workspace_id NOT NULL DEFAULT sentinel(equria) + RLS는
--   workspace 격리 + (본인 OR 관리자). 신규 가입자는 043으로 멤버 자동등록되어 INSERT 가능.
-- 관리자(profiles.role='admin')는 팀 전체를 보고 승인/반려한다.
-- 멱등(create table if not exists / drop policy if exists).

-- ── 관리자 여부 헬퍼(RLS 캐싱·안전) ──
create or replace function public.auth_is_admin()
returns boolean language sql security definer stable set search_path = public
as $$ select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') $$;
grant execute on function public.auth_is_admin() to authenticated;

-- ============================================================ 근태
create table if not exists public.attendance_records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  work_date    date not null default current_date,
  check_in     timestamptz,
  check_out    timestamptz,
  status       text not null default '정상' check (status in ('정상','지각','재택','외근','출장','연차','반차','결근')),
  note         text,
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1',
  created_at   timestamptz not null default now(),
  unique (user_id, work_date)
);
create index if not exists idx_attendance_user on public.attendance_records (user_id, work_date desc);
alter table public.attendance_records enable row level security;

drop policy if exists "att_select" on public.attendance_records;
create policy "att_select" on public.attendance_records for select using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = user_id or public.auth_is_admin())
);
drop policy if exists "att_insert" on public.attendance_records;
create policy "att_insert" on public.attendance_records for insert with check (
  (select auth.uid()) = user_id and public.is_workspace_member(workspace_id)
);
drop policy if exists "att_update" on public.attendance_records;
create policy "att_update" on public.attendance_records for update using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = user_id or public.auth_is_admin())
);
drop policy if exists "att_delete" on public.attendance_records;
create policy "att_delete" on public.attendance_records for delete using (
  (select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids())
);

-- ============================================================ 지출결의서
create table if not exists public.expense_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  amount       numeric not null default 0,
  category     text not null default '기타' check (category in ('식비','교통','접대','사무용품','출장','기타')),
  spent_on     date not null default current_date,
  description  text,
  status       text not null default '대기' check (status in ('대기','승인','반려')),
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1',
  created_at   timestamptz not null default now()
);
create index if not exists idx_expense_user on public.expense_reports (user_id, created_at desc);
alter table public.expense_reports enable row level security;

drop policy if exists "exp_select" on public.expense_reports;
create policy "exp_select" on public.expense_reports for select using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = user_id or public.auth_is_admin())
);
drop policy if exists "exp_insert" on public.expense_reports;
create policy "exp_insert" on public.expense_reports for insert with check (
  (select auth.uid()) = user_id and public.is_workspace_member(workspace_id)
);
drop policy if exists "exp_update" on public.expense_reports;
create policy "exp_update" on public.expense_reports for update using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = user_id or public.auth_is_admin())
);
drop policy if exists "exp_delete" on public.expense_reports;
create policy "exp_delete" on public.expense_reports for delete using (
  (select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids())
);

-- ============================================================ 휴가
create table if not exists public.leave_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  leave_type   text not null default '연차' check (leave_type in ('연차','반차','병가','경조사','공가','기타')),
  start_date   date not null default current_date,
  end_date     date not null default current_date,
  reason       text,
  status       text not null default '대기' check (status in ('대기','승인','반려')),
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1',
  created_at   timestamptz not null default now()
);
create index if not exists idx_leave_user on public.leave_requests (user_id, created_at desc);
alter table public.leave_requests enable row level security;

drop policy if exists "lv_select" on public.leave_requests;
create policy "lv_select" on public.leave_requests for select using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = user_id or public.auth_is_admin())
);
drop policy if exists "lv_insert" on public.leave_requests;
create policy "lv_insert" on public.leave_requests for insert with check (
  (select auth.uid()) = user_id and public.is_workspace_member(workspace_id)
);
drop policy if exists "lv_update" on public.leave_requests;
create policy "lv_update" on public.leave_requests for update using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = user_id or public.auth_is_admin())
);
drop policy if exists "lv_delete" on public.leave_requests;
create policy "lv_delete" on public.leave_requests for delete using (
  (select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids())
);
