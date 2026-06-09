-- 040: B1-a — RLS로 안 닫히는 함수들을 워크스페이스 인지하도록 수정.
--   (a) directory_contact(): 같은 워크스페이스 동료(또는 본인/관리자)만 연락처 반환(레드팀 #2/PII)
--   (b) 알림 트리거 3종: notifications INSERT 시 부모의 workspace_id 전파(레드팀 #11, sentinel 오염 방지)
--   (c) get_or_create_direct_conversation(): 공유 워크스페이스로 대화 생성, 교차회사 DM 차단(레드팀 #5)
-- 모두 security definer라 RLS 우회 → 함수 본문에서 직접 격리. 멱등(create or replace). 헬퍼: 034 shares_workspace_with.

-- (a) 연락처 RPC — 같은 워크스페이스만
create or replace function public.directory_contact(target uuid)
 returns table(email text, work_phone text, mobile text)
 language sql
 security definer
 set search_path to ''
as $function$
  select
    case when p.contact_privacy->>'email' = 'all' or target = auth.uid()
              or exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin')
         then p.email end,
    case when p.contact_privacy->>'work_phone' = 'all' or target = auth.uid()
              or exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin')
         then p.work_phone end,
    case when p.contact_privacy->>'mobile' = 'all' or target = auth.uid()
              or exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin')
         then p.mobile end
  from public.profiles p
  where p.id = target
    and (target = auth.uid()
         or exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin')
         or public.shares_workspace_with(target));
$function$;

-- (b1) DM 알림 트리거 — notifications.workspace_id = 메시지의 workspace
create or replace function public.handle_new_dm()
 returns trigger
 language plpgsql
 security definer
as $function$
declare
  recipient   uuid;
  conv        record;
  sender_name text;
begin
  select * into conv from public.direct_conversations where id = new.conversation_id;
  recipient := case when conv.user_a = new.sender_id then conv.user_b else conv.user_a end;
  if recipient <> new.sender_id then
    select name into sender_name from public.profiles where id = new.sender_id;
    insert into public.notifications (user_id, type, title, body, link, metadata, workspace_id)
    values (recipient, 'dm',
            coalesce(nullif(sender_name, ''), '누군가') || '님의 새 메시지',
            left(new.content, 50),
            '/chat/' || new.sender_id,
            jsonb_build_object('message_id', new.id, 'sender_id', new.sender_id),
            new.workspace_id);
  end if;
  return new;
end;
$function$;

-- (b2) 일정 완료 알림 트리거
create or replace function public.handle_event_done()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  attendee uuid;
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    foreach attendee in array new.attendees loop
      insert into public.notifications (user_id, type, title, body, link, metadata, workspace_id)
      values (attendee, 'event_done', '일정 완료', new.title,
              '/calendar', jsonb_build_object('event_id', new.id), new.workspace_id);
    end loop;
  end if;
  return new;
end;
$function$;

-- (b3) 프로젝트 배정 알림 트리거
create or replace function public.handle_project_assigned()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  proj record;
begin
  select * into proj from public.projects where id = new.project_id;
  insert into public.notifications (user_id, type, title, body, link, metadata, workspace_id)
  values (new.user_id, 'project_assigned', '프로젝트 배정', proj.name,
          '/projects/' || new.project_id, jsonb_build_object('project_id', new.project_id), new.workspace_id);
  return new;
end;
$function$;

-- (c) DM 대화 생성 — 공유 워크스페이스 필수(교차회사 DM 차단), 대화에 workspace_id 세팅
create or replace function public.get_or_create_direct_conversation(other_user uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  me uuid := auth.uid();
  lo uuid;
  hi uuid;
  conv_id uuid;
  shared_ws uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;

  -- 두 사용자가 공유하는 워크스페이스(자기 자신과의 채팅도 동일 워크스페이스로 동작)
  select wm1.workspace_id into shared_ws
  from public.workspace_members wm1
  join public.workspace_members wm2 on wm2.workspace_id = wm1.workspace_id
  where wm1.user_id = me and wm2.user_id = other_user
  limit 1;
  if shared_ws is null then raise exception 'no shared workspace with target user'; end if;

  lo := least(me, other_user);
  hi := greatest(me, other_user);

  select id into conv_id from public.direct_conversations
    where user_a = lo and user_b = hi;

  if conv_id is null then
    insert into public.direct_conversations (user_a, user_b, workspace_id)
      values (lo, hi, shared_ws)
      returning id into conv_id;
  end if;

  return conv_id;
end;
$function$;
