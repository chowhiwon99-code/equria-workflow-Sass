-- 048: 회의록 인라인 미디어 버킷(meeting-media) — 블록 에디터의 이미지/파일 블록용.
--
-- 노션식 본문에 이미지가 인라인으로 보이고 파일(pdf/zip/docs/excel/ppt 등 모든 형식) 블록이
-- 박히려면 안정적인 공개 URL이 필요하다. files 버킷은 본인 폴더만 읽기라 임베드 불가 →
-- 공개 버킷을 따로 둔다. 업로드는 인증 사용자 본인 폴더({uid}/...)로 제한, 읽기는 공개.
-- ⚠️ 트레이드오프: 공개 버킷이라 URL을 아는 사람은 워크스페이스 밖에서도 접근 가능(추측 불가한 uuid 경로).
--    사내 회의 자료엔 통상 허용 범위. 더 엄격히 가려면 비공개+서버 서명으로 후속 강화(HANDOFF 기록).
insert into storage.buckets (id, name, public)
values ('meeting-media', 'meeting-media', true)
on conflict (id) do update set public = true;

-- 업로드: 인증 사용자가 본인 폴더에만.
drop policy if exists "mmedia_insert" on storage.objects;
create policy "mmedia_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'meeting-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 삭제: 본인 객체만(노트/블록 정리용).
drop policy if exists "mmedia_delete" on storage.objects;
create policy "mmedia_delete" on storage.objects for delete to authenticated
using (bucket_id = 'meeting-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 읽기: 공개(임베드용 공개 URL 보장).
drop policy if exists "mmedia_read" on storage.objects;
create policy "mmedia_read" on storage.objects for select
using (bucket_id = 'meeting-media');
