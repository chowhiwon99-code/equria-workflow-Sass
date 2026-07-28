-- 118: B2 감사 V4 — 공지 알림 fan-out에서 게스트 제외.
--
-- 문제: announcements SELECT는 게스트를 차단(051, auth_user_workspace_ids)하지만,
--   fanout_announcement 트리거(053)는 workspace_members 전체에 알림을 뿌린다(role 필터 없음).
--   마이그 114가 notif_select를 "user_id=본인"으로 완화한 뒤로, 게스트가 자기에게 꽂힌
--   공지 알림(제목+본문 120자)을 읽어 사내 공지가 유출된다.
-- 해결: fan-out 대상에 role <> 'guest' 추가(정식 멤버에게만). 멱등(create or replace).
-- 롤백: 053 원문(role 필터 없는 버전)으로 복원.

create or replace function public.fanout_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link, workspace_id)
  select wm.user_id,
         'announcement',
         '📢 ' || case when coalesce(new.title, '') <> '' then new.title else '새 공지' end,
         left(coalesce(new.content, ''), 120),
         '/dashboard',
         new.workspace_id
  from public.workspace_members wm
  where wm.workspace_id = new.workspace_id
    and wm.user_id <> new.user_id
    and wm.role <> 'guest';
  return new;
end
$$;
