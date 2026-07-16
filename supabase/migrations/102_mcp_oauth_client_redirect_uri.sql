-- 102: MCP OAuth 자가치유 — DCR로 등록한 client에 redirect_uri를 함께 저장.
-- 앱 주소(NEXT_PUBLIC_APP_URL) 또는 도메인이 바뀌면 저장된 redirect_uri와 현재 값이 달라짐 →
-- 코드가 이를 감지해 옛 등록을 무효화하고 새 주소로 자동 재등록(DCR)한다. 수동 DB 삭제 불필요.
-- 추가형·멱등. 기존 행은 redirect_uri=null(다음 연결 시 현재 값으로 채워짐).
alter table public.mcp_oauth_clients add column if not exists redirect_uri text;
