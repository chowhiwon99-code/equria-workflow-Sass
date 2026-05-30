-- 010_chat_files_participant_read.sql
-- 문제: 채팅 첨부 이미지가 수신자에게 무한 로딩으로만 표시됨.
-- 원인: chat-files Storage RLS(chatfiles_rw, 005)가 본인 폴더(업로더)만 읽기 허용 →
--       수신자가 발신자 경로(senderId/uuid.ext)로 createSignedUrl 호출 시 RLS가 막아 URL 미생성.
-- 해결: 기존 본인-폴더 정책(for all, 유지)에 더해, "해당 첨부가 속한 대화의 참여자"면
--       읽기(SELECT)를 허용하는 permissive 정책을 OR로 추가. INSERT/UPDATE/DELETE는 기존대로 본인 폴더만.

-- attachment_url 조회 최적화용 부분 인덱스
create index if not exists idx_direct_messages_attachment_url
  on public.direct_messages (attachment_url)
  where attachment_url is not null;

drop policy if exists "chatfiles_participant_read" on storage.objects;

create policy "chatfiles_participant_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-files'
    and exists (
      select 1
      from public.direct_messages dm
      join public.direct_conversations dc on dc.id = dm.conversation_id
      where dm.attachment_url = storage.objects.name
        and (dc.user_a = auth.uid() or dc.user_b = auth.uid())
    )
  );
