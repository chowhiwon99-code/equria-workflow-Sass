-- 027: 채팅 첨부 Realtime 수신 — message_attachments를 supabase_realtime publication에 추가. 멱등·additive.
--   현상(버그): direct_messages·message_reactions는 publication에 있어 수신측이 실시간 반영되지만
--   message_attachments는 빠져 있어, 상대가 보낸 다중첨부가 focus/reload 전까지 안 보였다
--   (DirectChat의 message_attachments 구독은 있으나 이벤트가 발생하지 않음).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_attachments'
  ) then
    alter publication supabase_realtime add table public.message_attachments;
  end if;
end $$;

-- 다른 채팅 테이블(direct_messages·message_reactions)과 일관되게 full(마이그 007 패턴).
-- INSERT 수신엔 영향 없고 DELETE/UPDATE 구이미지 브로드캐스트까지 보장.
alter table public.message_attachments replica identity full;
