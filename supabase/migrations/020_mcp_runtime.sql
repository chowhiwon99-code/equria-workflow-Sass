-- 020: MCP 직접 연결 런타임 준비.
--  (1) type CHECK: stdio(서버리스 자식프로세스 불가) 제거, http(Streamable HTTP) 추가.
--  (2) 인증 타입 + 테스트 결과 메타. 베어러 토큰은 DB가 아니라 Vercel env(MCP_<NAME>_TOKEN)에 보관(평문 DB 저장 회피).
--  (3) 발견된 도구 캐시 테이블(mcp_tools).
-- 멱등. 기존 mcp_select(인증자 읽기)·mcp_admin(role=admin 전권) 정책 유지.

alter table public.mcp_servers drop constraint if exists mcp_servers_type_check;
update public.mcp_servers set type = 'http' where type not in ('http', 'sse');
alter table public.mcp_servers add constraint mcp_servers_type_check check (type in ('http', 'sse'));

alter table public.mcp_servers add column if not exists auth_type text not null default 'none'
  check (auth_type in ('none', 'bearer'));
alter table public.mcp_servers add column if not exists last_tested_at timestamptz;
alter table public.mcp_servers add column if not exists last_test_ok boolean;
alter table public.mcp_servers add column if not exists last_test_error text;

create table if not exists public.mcp_tools (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.mcp_servers(id) on delete cascade,
  name text not null,
  description text,
  input_schema jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (server_id, name)
);
create index if not exists mcp_tools_server_idx on public.mcp_tools (server_id);

alter table public.mcp_tools enable row level security;

drop policy if exists "mcptools_select" on public.mcp_tools;
create policy "mcptools_select" on public.mcp_tools for select using (auth.uid() is not null);

drop policy if exists "mcptools_admin" on public.mcp_tools;
create policy "mcptools_admin" on public.mcp_tools for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
