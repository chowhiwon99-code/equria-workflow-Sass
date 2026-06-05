-- 029: DM 알림 제목에 보낸 사람 이름 포함 — handle_new_dm 트리거 함수 재정의(005 대체). 멱등.
--   기존 '새 메시지' → '{보낸사람}님의 새 메시지'. 기존 알림 행은 불변(신규 알림부터 반영).
--   메타데이터에 sender_id 추가. 나머지 로직(본인 제외·body·link)은 그대로.
create or replace function public.handle_new_dm()
returns trigger as $$
declare
  recipient   uuid;
  conv        record;
  sender_name text;
begin
  select * into conv from public.direct_conversations where id = new.conversation_id;
  recipient := case when conv.user_a = new.sender_id then conv.user_b else conv.user_a end;
  if recipient <> new.sender_id then
    select name into sender_name from public.profiles where id = new.sender_id;
    insert into public.notifications (user_id, type, title, body, link, metadata)
    values (recipient, 'dm',
            coalesce(nullif(sender_name, ''), '누군가') || '님의 새 메시지',
            left(new.content, 50),
            '/chat/' || new.sender_id,
            jsonb_build_object('message_id', new.id, 'sender_id', new.sender_id));
  end if;
  return new;
end;
$$ language plpgsql security definer;
