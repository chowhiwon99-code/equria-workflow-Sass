-- ============================================================
-- files.source 확장 — 프로젝트 파일 현황/외부 링크/Figma 지원
-- 'link'(일반 URL), 'figma'(Figma 디자인 링크) 추가
-- ============================================================
alter table public.files drop constraint files_source_check;
alter table public.files add constraint files_source_check
  check (source in ('gdrive','local','link','figma'));
