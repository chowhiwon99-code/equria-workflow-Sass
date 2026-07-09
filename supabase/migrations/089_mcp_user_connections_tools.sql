-- 089: mcp_user_connections에 도구 캐시 컬럼 추가(회사 공용 mcp_tools처럼 별도 테이블 두지 않고
-- 행이 적어 jsonb로 인라인 — 마지막 테스트에서 발견된 도구 [{name,description}]).

alter table public.mcp_user_connections add column tools jsonb not null default '[]'::jsonb;
comment on column public.mcp_user_connections.tools is '마지막 테스트에서 발견된 도구 목록 캐시([{name,description}])';
