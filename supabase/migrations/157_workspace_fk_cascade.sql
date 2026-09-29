-- 157: 워크스페이스 삭제 기능의 선행조건 — workspace_id가 있는데 workspaces FK가 없던 9개 테이블에
--      ON DELETE CASCADE FK를 단다. 이게 없으면 워크스페이스를 지워도 결재·근태·회의록 등이 고아로 남는다.
-- 사전 확인(2026-09-29): 9개 모두 workspace_id NOT NULL · null 0건 · 고아(없는 워크스페이스 참조) 0건
--   → 기존 행 전부 제약을 만족하므로 추가만으로 동작 변화 없음(삭제가 일어날 때만 연쇄).
-- 되돌리기: alter table public.<t> drop constraint <t>_workspace_id_fkey;

alter table public.announcements
  add constraint announcements_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.approval_documents
  add constraint approval_documents_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.approval_steps
  add constraint approval_steps_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.approval_comments
  add constraint approval_comments_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.attendance_records
  add constraint attendance_records_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.expense_reports
  add constraint expense_reports_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.leave_requests
  add constraint leave_requests_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.meeting_categories
  add constraint meeting_categories_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.meeting_notes
  add constraint meeting_notes_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

-- FK 컬럼 인덱스(없으면 워크스페이스 삭제 시 테이블별 순차 스캔). 이미 있으면 건너뜀.
create index if not exists announcements_workspace_id_idx on public.announcements (workspace_id);
create index if not exists approval_documents_workspace_id_idx on public.approval_documents (workspace_id);
create index if not exists approval_steps_workspace_id_idx on public.approval_steps (workspace_id);
create index if not exists approval_comments_workspace_id_idx on public.approval_comments (workspace_id);
create index if not exists attendance_records_workspace_id_idx on public.attendance_records (workspace_id);
create index if not exists expense_reports_workspace_id_idx on public.expense_reports (workspace_id);
create index if not exists leave_requests_workspace_id_idx on public.leave_requests (workspace_id);
create index if not exists meeting_categories_workspace_id_idx on public.meeting_categories (workspace_id);
create index if not exists meeting_notes_workspace_id_idx on public.meeting_notes (workspace_id);
