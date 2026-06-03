-- 018: 워크플로우 실행 이력. 각 실행의 입력/최종출력/노드별 결과를 영속화
--   → 새로고침 후에도 "최근 실행"을 다시 볼 수 있게 한다(기존엔 클라 state에만 존재해 소실).
-- 멱등(create table if not exists / drop policy if exists). RLS: 본인 실행만.

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  input text,
  final_output text,
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  error text,
  -- [{ nodeId, agent_name, status, output, toolNote, error }]
  node_results jsonb not null default '[]'::jsonb,
  node_count integer not null default 0,
  duration_ms integer,
  created_at timestamptz not null default now()
);

-- 목록 조회(워크플로우별 최신순) + FK 인덱스(advisor unindexed_fk 예방)
create index if not exists workflow_runs_workflow_created_idx
  on public.workflow_runs (workflow_id, created_at desc);
create index if not exists workflow_runs_user_id_idx
  on public.workflow_runs (user_id);

alter table public.workflow_runs enable row level security;

-- 조회: 본인 실행만(공유 워크플로우의 타인 실행 가시성은 후속).
drop policy if exists "wfrun_select" on public.workflow_runs;
create policy "wfrun_select" on public.workflow_runs
  for select using (user_id = auth.uid());

-- 생성: 인증 + 본인 명의로만.
drop policy if exists "wfrun_insert" on public.workflow_runs;
create policy "wfrun_insert" on public.workflow_runs
  for insert with check (auth.uid() is not null and user_id = auth.uid());

-- 수정: 본인 것만(실행 종료 시 상태/결과 업데이트).
drop policy if exists "wfrun_update" on public.workflow_runs;
create policy "wfrun_update" on public.workflow_runs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
