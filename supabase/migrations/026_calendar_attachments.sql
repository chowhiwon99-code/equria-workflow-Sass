-- 026: 캘린더 일정 파일 첨부 — additive(컬럼 + 전용 버킷 + Storage RLS). 멱등.
--   기존 행 무손상(attachments default '[]'). 팀 캘린더는 워크스페이스 공유(cal_select=인증 전체)이므로
--   첨부 읽기=인증 사용자 전체, 쓰기/수정/삭제=본인 폴더({uid}/...)로 files/chat-files와 독립한 전용 버킷 사용.

-- [1] 첨부 메타 배열(jsonb). 각 원소: { path, name, mime_type, size }
--     실파일은 Storage(calendar-files)에 두고, 여기에는 메타만 보관(select * 로 이벤트와 함께 로드).
alter table public.calendar_events
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- [2] 전용 비공개 버킷(멱등). 002/005/015 버킷 패턴 따름.
insert into storage.buckets (id, name, public)
values ('calendar-files', 'calendar-files', false)
on conflict (id) do nothing;

-- [3] Storage RLS
--   읽기(select): 인증 사용자 전체 — 이벤트가 워크스페이스 공유라 cal_select와 일치
--   쓰기/수정/삭제: 본인 폴더({uid}/...)만 — 업로더 한정(files_rw 패턴)
drop policy if exists "calfiles_read" on storage.objects;
create policy "calfiles_read" on storage.objects for select to authenticated
  using (bucket_id = 'calendar-files');

drop policy if exists "calfiles_insert" on storage.objects;
create policy "calfiles_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'calendar-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "calfiles_update" on storage.objects;
create policy "calfiles_update" on storage.objects for update to authenticated
  using (bucket_id = 'calendar-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'calendar-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "calfiles_delete" on storage.objects;
create policy "calfiles_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'calendar-files' and (storage.foldername(name))[1] = auth.uid()::text);
