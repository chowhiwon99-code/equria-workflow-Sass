-- 032: 에이전트 소프트삭제가 RLS에 막히던 문제 수정 (031 워크플로우와 동일 원인·동일 해법).
--
-- 증상: 커스텀(직접 만든) 에이전트의 '삭제'(is_active=false 소프트삭제)가 소유자에게도 동작하지 않음.
-- 원인: agents_select 의 USING 이 `is_active` 를 필수로 요구 → is_active=false 로 UPDATE 하면
--       결과(새) 행이 SELECT 가시성을 잃어 PostgreSQL 이 42501
--       "new row violates row-level security policy" 로 거부한다(워크플로우와 동일).
--       (기본 8개 에이전트는 created_by=null 이라 애초에 소유자 update 자체가 불가 → 영향 없음.
--        커스텀 에이전트에서만 발생.)
-- 해결: 소유자는 자신의 에이전트를 활성/비활성과 무관하게 SELECT 할 수 있게 완화한다.
--       → 소프트삭제(→false)와 복원(→true) 모두 일반 UPDATE 로 동작.
--       모든 조회 사이트(agents/page·agents/[id]·agents/[id]/edit·MyPage·AgentChat·
--       WorkflowsView·WorkflowEditor)는 이미 is_active=true 를 명시 필터하므로
--       소프트삭제된 에이전트가 사용자에게 노출되지 않는다(표준 소프트삭제 패턴).
--
-- 멱등(drop policy if exists). insert/update/delete 정책은 변경하지 않는다.
-- 의미 변화는 "소유자가 자신의 비활성 에이전트를 조회 가능"뿐(앱은 항상 is_active=true 필터).

drop policy if exists "agents_select" on public.agents;
create policy "agents_select" on public.agents
  for select using (
    auth.uid() is not null
    and (created_by = auth.uid() or (is_active and is_public))
  );
