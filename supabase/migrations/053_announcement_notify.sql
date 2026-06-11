-- 053: 공지 올리면 워크스페이스 전 직원에게 벨 알림 자동 발송.
-- SECURITY DEFINER 트리거가 notifications에 멤버별로 1행씩 생성(작성자=오너 본인은 제외).
-- 클릭하면 /dashboard(공지 칸)로 이동. NotificationBell이 종 배지로 표시.

-- notifications.type CHECK에 'announcement' 추가.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['dm','event_done','event_invite','project_assigned','mail','system','announcement']));

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
    and wm.user_id <> new.user_id;
  return new;
end
$$;

drop trigger if exists trg_fanout_announcement on public.announcements;
create trigger trg_fanout_announcement
  after insert on public.announcements
  for each row execute function public.fanout_announcement();
