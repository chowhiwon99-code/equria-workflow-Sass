-- 120: workspace_id 인덱스 보강 — 멀티테넌트 조회 성능(회사 수 증가 대비).
--
-- 배경: 모든 테넌트 데이터가 한 DB에 있고 RLS가 매 SELECT에 workspace_id in (auth_user_workspace_ids())로
--   필터한다. workspace_id 선두 인덱스가 없으면 회사가 많아질수록 풀스캔 → 느려짐.
-- 감사(2026-07-28): workspace_id 컬럼 보유 ~45개 테이블 중 8개에 선두 인덱스 부재 —
--   전부 데이터가 빠르게 쌓이는 자식 테이블(채팅·근태·결재). 지금 추가(데이터 적을 때가 가장 쌈).
-- 추가형·멱등(create index if not exists)·CONCURRENTLY 미사용(트랜잭션 마이그·현 규모 즉시 완료).
-- 롤백: 각 인덱스 drop index if exists.

create index if not exists idx_group_messages_ws on public.group_messages (workspace_id);
create index if not exists idx_group_message_attachments_ws on public.group_message_attachments (workspace_id);
create index if not exists idx_group_message_reactions_ws on public.group_message_reactions (workspace_id);
create index if not exists idx_attendance_records_ws on public.attendance_records (workspace_id);
create index if not exists idx_expense_reports_ws on public.expense_reports (workspace_id);
create index if not exists idx_leave_requests_ws on public.leave_requests (workspace_id);
create index if not exists idx_approval_comments_ws on public.approval_comments (workspace_id);
create index if not exists idx_approval_steps_ws on public.approval_steps (workspace_id);
