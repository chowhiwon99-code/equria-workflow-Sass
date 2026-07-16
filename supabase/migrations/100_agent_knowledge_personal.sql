-- 100: 지식파일 '개인 전용' 옵션. is_personal=true면 올린 본인(created_by)만 열람 — 공유 에이전트여도 남에겐 안 보이고 주입도 안 됨.
-- 기본 false(=지금까지처럼 에이전트가 보이면 지식도 함께 보임). 추가형·멱등.
alter table public.agent_knowledge add column if not exists is_personal boolean not null default false;

-- SELECT 재작성: 개인 전용은 created_by 본인만 + 기존 부모-에이전트 가시성.
-- (채팅 라우트가 사용자 스코프 클라이언트로 조회하므로, 이 정책만으로 개인 지식은 본인 대화에만 주입됨.)
drop policy if exists ak_select on public.agent_knowledge;
create policy ak_select on public.agent_knowledge for select using (
  (not agent_knowledge.is_personal or agent_knowledge.created_by = (select auth.uid()))
  and exists (
    select 1 from public.agents a
    where a.id = agent_knowledge.agent_id
      and a.workspace_id in (select public.auth_user_workspace_ids())
      and a.is_active
      and (a.is_public or a.created_by = (select auth.uid()))
  )
);
