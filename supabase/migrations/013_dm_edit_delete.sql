-- 013_dm_edit_delete.sql
-- DM 메시지 수정/삭제: 본인 메시지만 텍스트 수정(edited_at) + soft-delete(deleted_at).
-- 삭제는 행 보존 + "삭제된 메시지입니다" placeholder 렌더(첨부 storage 고아 방지 = 휴지통 정책).

alter table public.direct_messages add column if not exists edited_at  timestamptz;
alter table public.direct_messages add column if not exists deleted_at timestamptz;

-- UPDATE RLS를 작성자 전용으로 좁힘 (수정/삭제는 본인 메시지만).
-- 읽음처리(mark_dm_read)는 SECURITY DEFINER 라 RLS 우회 → 영향 없음.
-- 직접 update 하는 클라이언트 코드는 없음(insert만) → 회귀 위험 없음.
drop policy if exists dm_update on public.direct_messages;
create policy dm_update on public.direct_messages for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());
