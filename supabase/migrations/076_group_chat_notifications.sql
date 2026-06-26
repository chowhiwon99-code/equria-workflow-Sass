-- 076: 그룹채팅 알림 — group_messages INSERT 시 방 멤버(발신자 제외)에게 notifications 생성.
--   DM(handle_new_dm + on_new_dm 트리거, 002/029/041) 패턴 동형.
--   커스텀방(room_members)만 알림 / 전체방(is_default·all-hands)은 소음 방지로 제외(대표 결정 2026-06-25).
--   + mark_room_read가 해당 방의 'group' 알림도 읽음처리(009 mark_dm_read 패턴 — 방 입장 시 벨 배지 정리).
--   멱등(create or replace + drop trigger if exists). notifications는 이미 realtime 발행(002:337)·RLS(037)·정의됨.

-- ⚠️ 먼저: notifications.type CHECK에 'group' 추가(055 패턴). 안 하면 트리거 INSERT가 제약위반→
--    AFTER INSERT라 group_messages 전송 자체가 롤백된다. 반드시 트리거보다 먼저.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['dm','event_done','event_invite','project_assigned','mail','system','announcement','approval','group']));

-- ── 트리거 함수: 그룹 메시지 → 수신자별 알림 ──────────────────────────
create or replace function public.handle_new_group_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  room        record;
  sender_name text;
begin
  select * into room from public.group_rooms where id = new.room_id;
  if room is null then return new; end if;
  -- 전체방(all-hands)은 너무 잦아 알림 제외 — 커스텀 초대방만 알림(대표 결정 2026-06-25)
  if room.is_default then return new; end if;
  select name into sender_name from public.profiles where id = new.sender_id;

  -- 커스텀방 멤버(room_members), 발신자 제외
  insert into public.notifications (user_id, type, title, body, link, metadata, workspace_id)
  select rm.user_id, 'group',
         coalesce(nullif(sender_name, ''), '누군가') || ' · ' || coalesce(nullif(room.name, ''), '그룹 채팅'),
         left(new.content, 50),
         '/chat/group/' || new.room_id,
         jsonb_build_object('message_id', new.id, 'sender_id', new.sender_id, 'room_id', new.room_id),
         new.workspace_id
    from public.room_members rm
   where rm.room_id = new.room_id
     and rm.user_id <> new.sender_id;

  return new;
end;
$$;

drop trigger if exists on_new_group_message on public.group_messages;
create trigger on_new_group_message
  after insert on public.group_messages
  for each row execute procedure public.handle_new_group_message();

-- 권한 하드닝(012 패턴): 트리거 함수는 누구도 직접 호출 불가
revoke execute on function public.handle_new_group_message() from public, anon, authenticated;

-- ── mark_room_read 확장: 그룹 알림도 읽음처리(009 패턴) ──────────────
create or replace function public.mark_room_read(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_room_member(p_room) then raise exception 'not a room member'; end if;
  insert into public.group_read_state (room_id, user_id, last_read_at)
  values (p_room, auth.uid(), now())
  on conflict (room_id, user_id) do update set last_read_at = now();
  -- 이 방의 'group' 알림 읽음처리(벨 배지 즉시 정리)
  update public.notifications
     set is_read = true
   where user_id = auth.uid()
     and type = 'group'
     and is_read = false
     and link = '/chat/group/' || p_room::text;
end;
$$;
revoke execute on function public.mark_room_read(uuid) from public, anon;
grant execute on function public.mark_room_read(uuid) to authenticated;
