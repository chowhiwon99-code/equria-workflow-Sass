-- 041: B1-a 하드닝 — handle_new_dm 트리거에 고정 search_path 설정.
-- 어드바이저(function_search_path_mutable): SECURITY DEFINER 함수가 search_path 미설정이면
--   호출 컨텍스트의 search_path 조작 위험. 본문은 이미 public.* 로 정규화돼 있어 search_path=''로 고정해도 안전.
-- (built-in은 pg_catalog 묵시 우선이라 영향 없음). 멱등(create or replace).
create or replace function public.handle_new_dm()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare recipient uuid; conv record; sender_name text;
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
