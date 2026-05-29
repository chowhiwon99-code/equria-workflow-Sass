-- 009: DM 읽음 처리 RPC (SECURITY DEFINER)
--
-- 배경: 채팅 입장 시 클라이언트에서 direct_messages 를 직접 UPDATE 했으나
-- read_at 이 갱신되지 않아(목록 빨간 unread 배지가 안 사라짐) RLS/세션 변수를
-- 배제하기 위해 서버 측 함수로 일원화.
--
-- 동작: 호출자가 참여한 대화에 한해 상대가 보낸 안 읽은 메시지를 읽음 처리하고,
-- 해당 대화 상대(/chat/{other})의 DM 알림도 함께 읽음 처리한다. 처리한 메시지 수를 반환.
-- DirectChat 은 입장 시 + 실시간 메시지 도착 시 이 RPC 를 호출한다.

create or replace function public.mark_dm_read(conv_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  other uuid;
  updated integer := 0;
begin
  if uid is null then
    return 0;
  end if;

  -- 본인이 참여한 대화만 처리
  select case when c.user_a = uid then c.user_b else c.user_a end
    into other
  from direct_conversations c
  where c.id = conv_id and (c.user_a = uid or c.user_b = uid);

  if other is null then
    return 0;
  end if;

  update direct_messages
    set read_at = now()
    where conversation_id = conv_id
      and sender_id <> uid
      and read_at is null;
  get diagnostics updated = row_count;

  -- 이 대화 상대가 보낸 DM 알림도 읽음 처리
  update notifications
    set is_read = true
    where user_id = uid
      and type = 'dm'
      and is_read = false
      and link = '/chat/' || other::text;

  return updated;
end;
$$;

grant execute on function public.mark_dm_read(uuid) to authenticated;
