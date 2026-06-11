-- 057: direct_conversations를 realtime publication에 추가.
-- 채팅 목록(ChatList)의 방 순서(last_message_at)·새 대화 생성이 타기기/타창에 실시간 반영되도록.
-- (direct_messages·message_attachments·message_reactions·notifications는 이미 등록됨.)
do $$ begin
  alter publication supabase_realtime add table public.direct_conversations;
exception when duplicate_object then null; end $$;
