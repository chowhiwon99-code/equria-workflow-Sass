-- 149: 회의노트 전사 분리 저장 — 회의노트 대개편 P1 (계획: fluffy-cooking-nest, 세션56 승인)
--
-- 붙여넣기 파서(클로바노트·VTT·"이름: 발화")가 구조화한 전사를 본문(content HTML)과 분리해 저장.
-- 형식: { segments: [{ speaker: text|null, ts: text|null, text: text }], source: 'clova'|'vtt'|'plain' }
-- 왜 분리: Enhance("메모 완성")·AI 도구는 구조화 입력을 받고, 본문은 사람이 읽는 완성본으로
-- 유지한다(Granola 모델). 목록 쿼리(NoteMeta)는 이 컬럼을 로드하지 않는다.
--
-- 롤백: alter table public.meeting_notes drop column if exists transcript;

alter table public.meeting_notes add column if not exists transcript jsonb;
