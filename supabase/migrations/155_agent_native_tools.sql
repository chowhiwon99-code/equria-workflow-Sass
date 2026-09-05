-- 155: 에이전트에 앱 내부 도구 개방 스위치 — 회의노트 대개편 P5
--
-- 에이전트 채팅(agents/[id]/chat)은 지금까지 **외부 MCP 도구만** 붙었다. 컴피만 앱 데이터를 읽을 수
-- 있었던 비대칭을 없앤다: agent_versions.native_tools에 'meetings'가 들어 있으면 회의록·아이디어
-- 네이티브 도구(buildMeetingTools)를 함께 병합한다.
--
-- 왜 컬럼으로 통제하나: 모든 에이전트에 회사 데이터를 자동 개방하면 프롬프트가 커지고(원가) 의도도
-- 흐려진다. 회의·아이디어 전문 에이전트 4종(agentTemplates P5 팩)만 기본 on으로 시드된다.
-- ⚠️ 도구 병합은 기존 **이름순 정렬** 경로에 합류하므로 프롬프트 캐시 규약과 충돌하지 않는다
--    (lib/mcp/loadTools.ts 헤더 규약 1 참고).
--
-- 롤백: alter table public.agent_versions drop column if exists native_tools;

alter table public.agent_versions
  add column if not exists native_tools text[] not null default '{}';
