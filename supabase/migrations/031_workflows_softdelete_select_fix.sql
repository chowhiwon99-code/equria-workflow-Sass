-- 031: 워크플로우 소프트삭제가 RLS에 막히던 문제 수정.
--
-- 증상: '워크플로우 삭제'(is_active=false 소프트삭제)가 소유자에게도 동작하지 않음
--       (페이지는 이동하지만 실제로 삭제 안 됨 / 또는 조용히 실패).
-- 원인: wf_select 의 USING 이 `is_active = true` 만 허용 → is_active=false 로 UPDATE 하면
--       결과(새) 행이 SELECT 가시성을 잃어 PostgreSQL 이 42501
--       "new row violates row-level security policy" 로 거부한다.
--       (PostgREST 는 UPDATE 결과 행에도 SELECT 정책을 적용하므로 소프트삭제 자체가 불가능했다.
--        017 에서 wf_select 를 소유자/공유 기반으로 좁히며 의도치 않게 생긴 회귀.)
-- 해결: 소유자는 자신의 워크플로우를 활성/비활성과 무관하게 SELECT 할 수 있게 완화한다.
--       → 소프트삭제(→false)와 복원(→true) 모두 일반 UPDATE 로 동작.
--       목록(WorkflowsView)·에디터(WorkflowEditor)·실행 라우트는 이미 is_active=true 를
--       명시적으로 필터/검사하므로 소프트삭제된 행이 사용자에게 노출되지 않는다(표준 소프트삭제 패턴).
--
-- 멱등(drop policy if exists). 수정/생성 정책(wf_update·wf_insert)은 변경하지 않는다.

drop policy if exists "wf_select" on public.workflows;
create policy "wf_select" on public.workflows
  for select using (
    created_by = auth.uid()
    or (is_active = true and is_public = true)
  );
