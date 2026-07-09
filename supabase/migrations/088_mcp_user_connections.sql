-- 088: MCP 직원별(개인) 연결 — GitHub·Supabase·Stripe 등 "개인 계정" 성격의 bearer 커넥터.
-- 회사 공용 서버(mcp_servers, Context7·DeepWiki 등 무인증/공유 자원)와 별개로,
-- 직원 각자가 자기 토큰으로 연결(google_connections와 동일 패턴 — 본인 것만 RLS).

create table public.mcp_user_connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  connector_id      text not null,  -- lib/mcp.ts의 Connector.id (예: "github")
  encrypted_token   text not null,
  last_tested_at    timestamptz,
  last_test_ok      boolean,
  last_test_error   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(user_id, connector_id)
);

comment on table public.mcp_user_connections is '직원별 MCP 커넥터 연결(개인 토큰) — 회사 공용 mcp_servers와 별개, 본인 행만 RLS 허용';

alter table public.mcp_user_connections enable row level security;

-- 본인 것만(구글 연동과 동일 정책 형태) — 관리자 게이트 없음: 개인 계정 연결은 누구나 스스로.
create policy "mcpuc_select" on public.mcp_user_connections for select using (auth.uid() = user_id);
create policy "mcpuc_insert" on public.mcp_user_connections for insert with check (auth.uid() = user_id);
create policy "mcpuc_update" on public.mcp_user_connections for update using (auth.uid() = user_id);
create policy "mcpuc_delete" on public.mcp_user_connections for delete using (auth.uid() = user_id);
