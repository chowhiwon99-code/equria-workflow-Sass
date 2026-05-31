-- 015: 파일관리 — 로컬 업로드용 비공개 버킷 + 소프트삭제 컬럼.
-- 멱등(if not exists / on conflict / drop policy if exists). 002/005 버킷 패턴 따름.

-- 소프트삭제(휴지통) 컬럼
alter table public.files add column if not exists deleted_at timestamptz;

-- 로컬 업로드 비공개 버킷
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

-- 본인 폴더({uid}/...)만 읽기/쓰기 (storage RLS)
drop policy if exists "files_rw" on storage.objects;
create policy "files_rw" on storage.objects for all to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
