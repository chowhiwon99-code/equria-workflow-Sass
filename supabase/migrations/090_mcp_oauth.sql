-- 090: MCP OAuth 지원 — 앱 전체 OAuth 클라이언트 등록(DCR 결과 공유) + 개인 연결 테이블에 OAuth 토큰 컬럼.

-- 앱 전체(직원 개인 아님) OAuth 클라이언트 등록 — 커넥터별 DCR(동적 클라이언트 등록) 결과를 전 직원이 공유 재사용.
create table public.mcp_oauth_clients (
  connector_id text primary key,
  client_id text not null,
  client_secret text,
  created_at timestamptz not null default now()
);
alter table public.mcp_oauth_clients enable row level security;
-- 정책 없음 = service_role(관리 클라이언트)만 접근. DCR client_id/secret은 앱 신원이라 어떤 인증 사용자에게도 노출 안 함.

alter table public.mcp_user_connections
  add column auth_method text not null default 'bearer',
  add column encrypted_refresh_token text,
  add column expires_at timestamptz;
alter table public.mcp_user_connections
  add constraint mcp_user_connections_auth_method_check check (auth_method in ('bearer','oauth'));
comment on column public.mcp_user_connections.encrypted_token is 'bearer=PAT 원문 암호화, oauth=access_token 암호화';
comment on column public.mcp_user_connections.encrypted_refresh_token is 'oauth 전용 — refresh_token 암호화(있으면)';
