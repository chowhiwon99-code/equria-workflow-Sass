-- ============================================================
-- EQURIA Workspace — Complete Database Schema
-- 파일: supabase/migrations/001_initial_schema.sql
-- 사용법: Supabase 대시보드 > SQL Editor에 복붙 후 실행
--         또는: supabase db push (CLI)
-- 참고: UUID는 PG13+ 내장 gen_random_uuid() 사용 (별도 확장 불필요).
-- ============================================================

-- ============================================================
-- Table 1: profiles (직원 프로필)
-- ============================================================
create table public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  email       text unique not null,
  name        text not null,
  role        text not null default 'member'
                check (role in ('admin', 'member')),
  department  text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is '이큐리아 직원 프로필';

-- 신규 가입 시 profiles 자동 생성 (security definer → RLS 우회, 정상)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Table 2: agents
-- ============================================================
create table public.agents (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  category    text not null
                check (category in ('tax','cs','content','translation',
                                    'document','analytics','legal','custom')),
  icon        text not null default '🤖',
  is_active   boolean not null default true,
  is_public   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- Table 3: agent_versions
-- ============================================================
create table public.agent_versions (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.agents(id) on delete cascade,
  version       integer not null default 1,
  system_prompt text not null,
  model         text not null default 'claude-sonnet-4-6',
  max_tokens    integer not null default 4096,
  temperature   decimal not null default 0.7
                  check (temperature >= 0 and temperature <= 1),
  tools         jsonb not null default '[]',
  mcp_servers   text[] not null default '{}',
  is_current    boolean not null default true,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique(agent_id, version)
);

-- 새 버전 생성 시 이전 버전 비활성화
create or replace function public.handle_new_agent_version()
returns trigger as $$
begin
  if new.is_current = true then
    update public.agent_versions
    set is_current = false
    where agent_id = new.agent_id and id != new.id and is_current = true;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_agent_version_created
  after insert on public.agent_versions
  for each row execute procedure public.handle_new_agent_version();

-- ============================================================
-- Table 4: conversations
-- ============================================================
create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid references public.agents(id) on delete set null,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text,
  status     text not null default 'active'
               check (status in ('active','archived')),
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Table 5: messages
-- ============================================================
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null,
  tokens_used     integer,
  model           text,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- Table 6: workflows
-- ============================================================
create table public.workflows (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  steps       jsonb not null default '[]',
  created_by  uuid references public.profiles(id) on delete set null,
  is_active   boolean not null default true,
  run_count   integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- Table 7: calendar_events
-- ============================================================
create table public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  start_time  timestamptz not null,
  end_time    timestamptz,
  all_day     boolean not null default false,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  attendees   uuid[] not null default '{}',
  color       text not null default '#3B82F6',
  location    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- Table 8: mcp_servers
-- ============================================================
create table public.mcp_servers (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  type       text not null check (type in ('stdio','sse')),
  command    text,
  args       text[],
  url        text,
  env_vars   jsonb not null default '{}',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Table 9: agent_usage
-- ============================================================
create table public.agent_usage (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid references public.agents(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  tokens_input    integer not null default 0,
  tokens_output   integer not null default 0,
  duration_ms     integer,
  success         boolean not null default true,
  error_message   text,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- RLS 정책
-- ============================================================
alter table public.profiles enable row level security;
alter table public.agents enable row level security;
alter table public.agent_versions enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.workflows enable row level security;
alter table public.calendar_events enable row level security;
alter table public.mcp_servers enable row level security;
alter table public.agent_usage enable row level security;

-- profiles
create policy "profiles_select" on public.profiles for select using (auth.uid() is not null);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- agents
create policy "agents_select"  on public.agents for select using (auth.uid() is not null and is_active = true);
create policy "agents_insert"  on public.agents for insert with check (auth.uid() is not null);
create policy "agents_update"  on public.agents for update using (auth.uid() = created_by);
create policy "agents_delete"  on public.agents for delete using (auth.uid() = created_by);

-- agent_versions
create policy "av_select" on public.agent_versions for select using (auth.uid() is not null);
create policy "av_insert" on public.agent_versions for insert with check (auth.uid() is not null);

-- conversations
create policy "conv_select" on public.conversations for select using (auth.uid() = user_id);
create policy "conv_insert" on public.conversations for insert with check (auth.uid() = user_id);
create policy "conv_update" on public.conversations for update using (auth.uid() = user_id);
create policy "conv_delete" on public.conversations for delete using (auth.uid() = user_id);

-- messages
create policy "msg_select" on public.messages for select
  using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy "msg_insert" on public.messages for insert
  with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));

-- workflows
create policy "wf_select" on public.workflows for select using (auth.uid() is not null and is_active = true);
create policy "wf_insert" on public.workflows for insert with check (auth.uid() is not null);
create policy "wf_update" on public.workflows for update using (auth.uid() = created_by);

-- calendar_events
create policy "cal_select" on public.calendar_events for select using (auth.uid() is not null);
create policy "cal_insert" on public.calendar_events for insert with check (auth.uid() is not null);
create policy "cal_update" on public.calendar_events for update using (auth.uid() = created_by);
create policy "cal_delete" on public.calendar_events for delete using (auth.uid() = created_by);

-- mcp_servers (admin만 관리)
create policy "mcp_select" on public.mcp_servers for select using (auth.uid() is not null);
create policy "mcp_admin"  on public.mcp_servers for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- agent_usage
create policy "usage_select" on public.agent_usage for select using (auth.uid() = user_id);
create policy "usage_insert" on public.agent_usage for insert with check (auth.uid() = user_id);

-- ============================================================
-- 인덱스
-- ============================================================
create index idx_agents_category    on public.agents(category) where is_active = true;
create index idx_conversations_user on public.conversations(user_id, created_at desc);
create index idx_messages_conv      on public.messages(conversation_id, created_at asc);
create index idx_usage_agent        on public.agent_usage(agent_id, created_at desc);
create index idx_calendar_time      on public.calendar_events(start_time, end_time);
