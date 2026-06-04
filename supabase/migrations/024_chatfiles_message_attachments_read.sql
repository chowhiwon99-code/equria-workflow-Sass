-- 024: chat-files Storage RLS를 다중첨부(message_attachments)까지 확장.
--   마이그010의 chatfiles_participant_read는 레거시 direct_messages.attachment_url만 커버한다.
--   단계5b의 message_attachments.storage_path 파일은 수신자(비소유자)가 createSignedUrl 호출 시
--   RLS에 막혀 서명URL이 안 나옴 → 상대의 다중첨부가 로딩만 됨. (010이 레거시 첨부에 했던 것과 동일한 문제)
--   해결: 010과 같은 패턴으로 "해당 첨부가 속한 대화의 참여자면 읽기 허용"을 OR로 추가(additive·멱등).
--   INSERT/UPDATE/DELETE는 기존 본인 폴더 정책(chatfiles_rw) 그대로.

create index if not exists idx_message_attachments_storage_path
  on public.message_attachments (storage_path);

drop policy if exists "chatfiles_participant_read" on storage.objects;
create policy "chatfiles_participant_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-files'
    and (
      -- 레거시: 단일 첨부 (direct_messages.attachment_url)
      exists (
        select 1
        from public.direct_messages dm
        join public.direct_conversations dc on dc.id = dm.conversation_id
        where dm.attachment_url = storage.objects.name
          and (dc.user_a = auth.uid() or dc.user_b = auth.uid())
      )
      -- 신규: 다중 첨부 (message_attachments.storage_path)
      or exists (
        select 1
        from public.message_attachments ma
        join public.direct_messages m on m.id = ma.message_id
        join public.direct_conversations c on c.id = m.conversation_id
        where ma.storage_path = storage.objects.name
          and (c.user_a = auth.uid() or c.user_b = auth.uid())
      )
    )
  );
