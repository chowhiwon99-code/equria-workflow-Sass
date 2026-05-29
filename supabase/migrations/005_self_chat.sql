-- ============================================================
-- 나와의 채팅 (셀프 DM) + 메시지 첨부
-- ============================================================

-- 1) 셀프 대화 허용 (user_a = user_b)
alter table public.direct_conversations drop constraint dc_ordered;
alter table public.direct_conversations add constraint dc_ordered check (user_a <= user_b);

-- 2) RPC: 자기 자신과의 대화 허용 (기존 'cannot DM yourself' 제거)
create or replace function public.get_or_create_direct_conversation(other_user uuid)
returns uuid
language plpgsql
security definer
as $function$
declare
  me uuid := auth.uid();
  lo uuid;
  hi uuid;
  conv_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  lo := least(me, other_user);
  hi := greatest(me, other_user);
  select id into conv_id from public.direct_conversations where user_a = lo and user_b = hi;
  if conv_id is null then
    insert into public.direct_conversations (user_a, user_b) values (lo, hi) returning id into conv_id;
  end if;
  return conv_id;
end;
$function$;

-- 3) 알림 트리거: 자기 자신에게는 알림 생성 안 함
create or replace function public.handle_new_dm()
returns trigger as $$
declare
  recipient uuid;
  conv      record;
begin
  select * into conv from public.direct_conversations where id = new.conversation_id;
  recipient := case when conv.user_a = new.sender_id then conv.user_b else conv.user_a end;
  if recipient <> new.sender_id then
    insert into public.notifications (user_id, type, title, body, link, metadata)
    values (recipient, 'dm', '새 메시지', left(new.content, 50),
            '/chat/' || new.sender_id, jsonb_build_object('message_id', new.id));
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- 4) 메시지 첨부 (파일/이미지)
alter table public.direct_messages
  add column if not exists attachment_url text,
  add column if not exists attachment_name text;

-- 5) 채팅 첨부용 비공개 버킷 + 본인 폴더 정책 (나와의 채팅 개인 저장소)
insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', false)
on conflict (id) do nothing;

create policy "chatfiles_rw" on storage.objects for all to authenticated
  using (bucket_id = 'chat-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'chat-files' and (storage.foldername(name))[1] = auth.uid()::text);
