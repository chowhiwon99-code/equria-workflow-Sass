-- 030: 멀티테넌시 A단계(구조 심기) — workspaces/workspace_members + 24개 데이터 테이블 workspace_id.
--   순수 additive·비파괴·멱등. 기본 워크스페이스 'equria'(고정 UUID)로 기존 데이터·유저 전부 귀속.
--   컬럼 DEFAULT 덕에 기존 RLS/앱 코드 무변경(workspace_id 미지정 insert도 equria로 자동 채워짐).
--   ⚠️ 격리(RLS를 workspace_members 기반으로 강제)·앱 배선·워크스페이스 생성/초대/전환은 B단계(차후, 신중히).

-- [1] 테넌트 테이블 2개 -------------------------------------------------------
create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  plan       text not null default 'free',
  owner_id   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 슬랙형 다대다: 한 계정이 여러 워크스페이스 소속 가능
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','admin','member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists idx_wm_user on public.workspace_members(user_id);

-- RLS (B단계 전까지 안전 기본값: 읽기만 멤버 기준, 쓰기는 service_role/마이그만)
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
drop policy if exists "wm_select" on public.workspace_members;
create policy "wm_select" on public.workspace_members for select using (user_id = auth.uid()); -- 본인 소속만(비재귀)
drop policy if exists "ws_select" on public.workspaces;
create policy "ws_select" on public.workspaces for select
  using (id in (select workspace_id from public.workspace_members where user_id = auth.uid()));

-- [2] 기본 워크스페이스 'equria' (고정 sentinel UUID) — 멱등 -------------------
insert into public.workspaces (id, name, slug, owner_id)
select '00000000-0000-0000-0000-0000000000e1', 'EQURIA', 'equria',
       (select id from public.profiles order by created_at asc limit 1)  -- 첫 가입자(조휘원)를 owner로
where not exists (select 1 from public.workspaces where slug = 'equria');

-- [3] 기존 전원 equria 멤버(첫 가입자=owner, 나머지=member) — 멱등 ------------
insert into public.workspace_members (workspace_id, user_id, role)
select '00000000-0000-0000-0000-0000000000e1', p.id,
       case when p.id = (select id from public.profiles order by created_at asc limit 1)
            then 'owner' else 'member' end
from public.profiles p
on conflict (workspace_id, user_id) do nothing;

-- [4] 24개 데이터 테이블에 workspace_id(NOT NULL DEFAULT equria, FK) + 인덱스 ---
--     ADD COLUMN if not exists → 멱등. 기존 행은 DEFAULT(equria)로 자동 백필.
do $$
declare t text;
begin
  foreach t in array array[
    'agents','agent_versions','agent_usage','user_agent_pins',
    'conversations','messages','assistant_conversations','assistant_messages',
    'direct_conversations','direct_messages','message_attachments','message_reactions',
    'workflows','workflow_runs','calendar_events','mcp_servers','mcp_tools',
    'files','business_cards','tax_invoices','finance_entries',
    'projects','project_members','notifications'
  ] loop
    execute format(
      'alter table public.%I add column if not exists workspace_id uuid not null default %L references public.workspaces(id) on delete cascade',
      t, '00000000-0000-0000-0000-0000000000e1');
    execute format('create index if not exists %I on public.%I (workspace_id)', t || '_workspace_id_idx', t);
  end loop;
end $$;
