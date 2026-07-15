-- 096_remove_default_agents.sql
-- 세션33 에이전트 재설계: 기본(시드) 에이전트 8개를 소프트 삭제(is_active=false).
-- 회사가 직접 필요한 에이전트를 만들어 쓰는 "빈 상태 시작" 방향(대표 결정).
--
-- created_by IS NULL = 기본 에이전트 식별자(seed.sql·067·068과 동일 규약).
-- 소프트 삭제라 agent_versions·user_agent_pins·agent_usage·conversations는 모두 보존되고,
-- 목록/위젯은 is_active=true 필터로 자동으로 숨긴다(FloatingAgentChat·agents/page 등).
--
-- 되돌리기(롤백): update public.agents set is_active = true where created_by is null;

update public.agents
set is_active = false
where created_by is null and is_active = true;
