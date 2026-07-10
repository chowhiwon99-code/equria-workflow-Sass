-- 094: 프로젝트 체크리스트(세부 할 일) — 프로젝트를 잘게 쪼갠 협업 체크리스트.
-- 접근 격리는 부모 projects(035 워크스페이스 격리)를 EXISTS로 상속 → 별도 workspace_id 비정규화·센티넬 default를 만들지 않음(B1-b 부채 회피).
-- 같은 워크스페이스에서 프로젝트를 볼 수 있는 멤버 = 체크리스트를 추가/체크/삭제 가능(팀 협업 체크리스트). Undo는 앱에서 역연산 등록.

create table if not exists public.project_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  done        boolean not null default false,
  due_date    date,
  sort_order  int not null default 0,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.project_tasks is '프로젝트 체크리스트(세부 할 일) — 부모 projects의 워크스페이스 격리를 EXISTS로 상속(별도 workspace_id 없음)';

create index if not exists idx_project_tasks_project on public.project_tasks (project_id, done, sort_order);

alter table public.project_tasks enable row level security;

-- 접근 = 부모 프로젝트를 볼 수 있는(같은 워크스페이스) 멤버. 협업 체크리스트라 CRUD 모두 동일 조건.
drop policy if exists "project_task_select" on public.project_tasks;
create policy "project_task_select" on public.project_tasks for select
  using (exists (
    select 1 from public.projects p
    where p.id = project_tasks.project_id
      and p.workspace_id in (select public.auth_user_workspace_ids())
  ));

drop policy if exists "project_task_insert" on public.project_tasks;
create policy "project_task_insert" on public.project_tasks for insert
  with check (exists (
    select 1 from public.projects p
    where p.id = project_tasks.project_id
      and p.workspace_id in (select public.auth_user_workspace_ids())
  ));

drop policy if exists "project_task_update" on public.project_tasks;
create policy "project_task_update" on public.project_tasks for update
  using (exists (
    select 1 from public.projects p
    where p.id = project_tasks.project_id
      and p.workspace_id in (select public.auth_user_workspace_ids())
  ));

drop policy if exists "project_task_delete" on public.project_tasks;
create policy "project_task_delete" on public.project_tasks for delete
  using (exists (
    select 1 from public.projects p
    where p.id = project_tasks.project_id
      and p.workspace_id in (select public.auth_user_workspace_ids())
  ));
