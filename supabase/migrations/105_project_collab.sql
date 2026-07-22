-- 105: 프로젝트 협업 개선 3종 (추가형·멱등)
-- ① 협업 멤버(project_members)도 프로젝트 수정 가능 — 중요도/상태가 생성자·담당자만 바뀌던 버그 수정.
-- ② 소프트삭제 deleted_at — 생성자가 자기 프로젝트를 삭제(휴지통, Undo 가능).
-- ③ 참고사항 notes — 프로젝트 하단 메모.
-- 롤백: 컬럼은 남겨도 무해(코드가 안 쓰면 그만) / update 정책은 035 원문(created_by/owner_id만)으로 되돌리면 됨.

-- ② ③ 추가형 컬럼 (기존 행/코드 무영향)
alter table public.projects add column if not exists deleted_at timestamptz;
alter table public.projects add column if not exists notes text;

-- ① UPDATE 정책: 기존 created_by/owner_id에 "프로젝트 멤버" OR를 한 겹 추가.
--    (035 원문 = created_by or owner_id. project_tasks(094)가 이미 멤버 전체 허용인 것과 정합.)
drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects for update
  using (
    workspace_id in (select public.auth_user_workspace_ids())
    and (
      (select auth.uid()) = created_by
      or (select auth.uid()) = owner_id
      or exists (
        select 1 from public.project_members pm
        where pm.project_id = projects.id and pm.user_id = (select auth.uid())
      )
    )
  );
