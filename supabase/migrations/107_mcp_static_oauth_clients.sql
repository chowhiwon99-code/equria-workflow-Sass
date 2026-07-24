-- 107: MCP 정적 OAuth 클라이언트(대표 등록 앱 크리덴셜) + 개인 커스텀 URL 커넥터.
-- 배경: 구글(Gmail·Cal·Drive)·Slack·PayPal의 원격 MCP는 DCR(동적 클라이언트 등록) 미지원 →
--       대표가 각 서비스에 OAuth 앱을 등록해 받은 client_id/secret을 넣어야 한다.
--       우리 OAuth(lib/mcp/oauth.ts)의 clientInformation()이 mcp_oauth_clients에서 client를 읽으므로
--       정적 client를 주입하면 auth()가 DCR을 건너뛰고 그대로 작동(핵심 발견, @ai-sdk/mcp 소스 검증).
-- 추가형·멱등. 롤백 = 두 컬럼 drop.

-- (1) 정적 크리덴셜 표시 — 대표가 설정에서 직접 넣은 client는 DCR 자가치유(마이그102 redirect_uri 무효화)가
--     덮거나 무효화하면 안 된다(DCR 미지원 서비스라 재등록 시 실패). is_static=true면 코드가 자가치유를 건너뛴다.
alter table public.mcp_oauth_clients add column if not exists is_static boolean not null default false;
comment on column public.mcp_oauth_clients.is_static is
  'true=대표가 설정에서 직접 등록한 정적 크리덴셜. DCR 자가치유가 덮거나 redirect_uri 불일치로 무효화하지 않음(DCR 미지원 서비스).';

-- (2) 개인 커스텀 URL 커넥터 — Zapier처럼 "계정별 전용 MCP URL"을 붙여넣는 커넥터.
--     카탈로그 프리셋 URL 대신 이 값을 쓴다(없으면 기존대로 프리셋 URL). connector.customUrl=true일 때만 사용.
alter table public.mcp_user_connections add column if not exists custom_url text;
comment on column public.mcp_user_connections.custom_url is
  '커스텀 URL 커넥터(예: Zapier 계정별 MCP URL)의 접속 주소. 카탈로그 프리셋 URL 대신 사용(customUrl 커넥터 전용).';
