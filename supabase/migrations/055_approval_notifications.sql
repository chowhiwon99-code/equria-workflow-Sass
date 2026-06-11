-- 055: notifications.type CHECK에 'approval'(전자결재 알림) 추가.
-- 054의 RPC들이 결재 요청/승인/반려 알림을 type='approval'로 생성한다(링크 /approval/<id>).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['dm','event_done','event_invite','project_assigned','mail','system','announcement','approval']));
