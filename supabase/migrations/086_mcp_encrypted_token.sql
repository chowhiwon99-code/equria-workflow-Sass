-- 086: MCP 서버 bearer 토큰을 DB에 암호화 저장 (전역 env 대신).
-- 값 = AES-256-GCM 암호문("iv:tag:cipher", lib/google/crypto.ts encryptToken 형식). 평문 저장 금지.
-- 서버에서 decryptToken으로 복호화해 Authorization: Bearer 로 사용. env(MCP_<NAME>_TOKEN)는 폴백.
alter table public.mcp_servers
  add column if not exists encrypted_token text;

comment on column public.mcp_servers.encrypted_token is
  'AES-256-GCM 암호화된 bearer 토큰(평문 아님). 서버 전용 decryptToken으로 복호화.';
