-- 158: 워크스페이스 오너도 프로젝트를 삭제할 수 있게 한다.
-- 왜: 기존 projects_delete는 생성자(created_by)만 허용 → 생성자가 워크스페이스에서 제외되면
--     그 프로젝트는 아무도 지울 수 없는 상태로 남는다(2026-09-29 실제 발생: 제외된 멤버가 만든 프로젝트).
-- 되돌리기: 아래 policy를 원래 식((auth.uid() = created_by) and workspace_id in auth_user_workspace_ids())으로 재생성.

drop policy if exists projects_delete on public.projects;

create policy projects_delete on public.projects
  for delete
  using (
    workspace_id in (select public.auth_user_workspace_ids())
    and (
      (select auth.uid()) = created_by
      or public.auth_is_workspace_owner(workspace_id)
    )
  );
