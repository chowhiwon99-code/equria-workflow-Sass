-- 098_agent_mcp_connectors.sql
-- 세션34 MCP 묶음: 에이전트가 사용할 "개인 MCP 커넥터(슬러그)" 바인딩.
-- mcp_servers(회사 공용 서버 UUID 배열)와 별개 — 이건 connector_id 슬러그(예: 'notion','asana').
-- 채팅/워크플로우 실행 시 "실행하는 사람 본인"의 mcp_user_connections에서 이 커넥터들을 해석해 도구로 로드한다
-- (공유 에이전트라도 A가 만들고 B가 쓰면 B의 연결로 동작 — 없으면 조용히 건너뜀).

alter table public.agent_versions
  add column if not exists mcp_connectors text[] not null default '{}';
