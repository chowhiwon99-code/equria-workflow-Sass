-- 097_agent_knowledge.sql
-- 세션34 Phase 3: 에이전트 지식파일(첨부 자료). 만들 때 PDF/이미지/텍스트 등 AI가 읽을 수 있는 파일을 붙여
-- 대화 시 풀컨텍스트로 주입한다. 저장은 기존 private 'files' 버킷 재사용(storage_path).
-- 격리: 자체 workspace_id 없이 부모 agents에서 EXISTS로 상속(project_tasks 패턴 = B1-b 센티넬 부채 회피).

create table if not exists public.agent_knowledge (
  id             uuid primary key default gen_random_uuid(),
  agent_id       uuid not null references public.agents(id) on delete cascade,
  storage_path   text not null,            -- '{uid}/{uuid}.ext' in private 'files' bucket
  name           text not null,
  mime_type      text,
  size           bigint,
  extracted_text text,                      -- 텍스트 파일 본문(선택). PDF/이미지는 null(런타임에 파일 파트로 주입)
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists agent_knowledge_agent_id_idx on public.agent_knowledge(agent_id);

alter table public.agent_knowledge enable row level security;

-- SELECT: 부모 에이전트가 내 워크스페이스에서 나에게 보이면(내 것 또는 공개) 열람
create policy ak_select on public.agent_knowledge for select using (
  exists (
    select 1 from public.agents a
    where a.id = agent_knowledge.agent_id
      and a.workspace_id in (select public.auth_user_workspace_ids())
      and a.is_active
      and (a.is_public or a.created_by = (select auth.uid()))
  )
);

-- INSERT: 내가 소유한(같은 워크스페이스) 에이전트에만 첨부
create policy ak_insert on public.agent_knowledge for insert with check (
  exists (
    select 1 from public.agents a
    where a.id = agent_knowledge.agent_id
      and a.created_by = (select auth.uid())
      and a.workspace_id in (select public.auth_user_workspace_ids())
  )
);

-- DELETE: 내가 소유한 에이전트의 지식만 삭제
create policy ak_delete on public.agent_knowledge for delete using (
  exists (
    select 1 from public.agents a
    where a.id = agent_knowledge.agent_id
      and a.created_by = (select auth.uid())
  )
);
