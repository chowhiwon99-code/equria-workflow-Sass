-- 073: 그룹 채팅 첨부 storage 읽기 정책 (ADD-only — DM 정책 024 미접촉).
-- 방 멤버가 그룹 메시지 첨부를 signed URL로 읽기 위함. 업로드는 기존 chatfiles_rw(uid 폴더)가 커버.
drop policy if exists chatfiles_group_read on storage.objects;
create policy chatfiles_group_read on storage.objects for select to authenticated
using (
  bucket_id = 'chat-files'
  and exists (
    select 1
    from public.group_message_attachments gma
    join public.group_messages m on m.id = gma.message_id
    where gma.storage_path = storage.objects.name
      and public.is_room_member(m.room_id)
  )
);
