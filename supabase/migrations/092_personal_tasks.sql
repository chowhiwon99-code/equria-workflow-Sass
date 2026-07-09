-- 092: 오늘 할 일(개인 체크리스트) — 직원 각자가 자기 할 일을 적고 체크한다.
-- 순수 개인 자원 → mcp_user_connections(088)와 동일하게 "본인 행만" RLS(관리자 게이트 없음, workspace 컬럼 불필요).
-- 시각 알림(remind_at)은 2차(스케줄러)에서 추가형으로 붙인다 — 지금은 저장·체크만.

create table public.personal_tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  done         boolean not null default false,
  due_date     date,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.personal_tasks is '개인 오늘 할 일 체크리스트 — 본인 행만 RLS(개인 자원, 공유 없음)';

create index idx_personal_tasks_user on public.personal_tasks (user_id, done, sort_order);

alter table public.personal_tasks enable row level security;

-- 본인 것만(mcp_user_connections·google_connections와 동일 형태).
create policy "ptask_select" on public.personal_tasks for select using (auth.uid() = user_id);
create policy "ptask_insert" on public.personal_tasks for insert with check (auth.uid() = user_id);
create policy "ptask_update" on public.personal_tasks for update using (auth.uid() = user_id);
create policy "ptask_delete" on public.personal_tasks for delete using (auth.uid() = user_id);
