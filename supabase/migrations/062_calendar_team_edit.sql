-- 062: 팀 캘린더 협업 — 일정 수정/삭제를 작성자 본인 → 워크스페이스 멤버 전체로 확대.
-- 배경: '팀 캘린더(공유)'인데 cal_update/cal_delete가 created_by=본인으로 제한되어
--       남이 만든 일정을 수정/삭제하면 RLS가 0행으로 막고(에러 없음) 프론트가 성공으로 오인 → "수정 안 됨".
-- 변경: 같은 워크스페이스 멤버면 누구나 수정/삭제 가능(테넌트 격리=workspace_id는 유지). select/insert는 035 그대로.
-- 멱등. 되돌리기 = created_by 조건을 다시 추가(035).

drop policy if exists "cal_update" on public.calendar_events;
create policy "cal_update" on public.calendar_events for update
  using (workspace_id in (select public.auth_user_workspace_ids()))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "cal_delete" on public.calendar_events;
create policy "cal_delete" on public.calendar_events for delete
  using (workspace_id in (select public.auth_user_workspace_ids()));
