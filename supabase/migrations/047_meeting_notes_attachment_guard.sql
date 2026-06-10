-- 047: 회의록 첨부 경로 위조 차단(IDOR 방어) — 리뷰 보안 발견 #1.
--
-- 문제: attachment 라우트는 noteId로 RLS 인가 후 admin(service_role) 클라이언트로
--   임의 attachment_path를 서명한다. 그런데 meeting_notes.attachment_path는 클라이언트가
--   임의 문자열로 INSERT/UPDATE할 수 있어(앱·RLS 모두 형식 미검증), 공격자가 자기 노트에
--   타인 폴더 경로 '{victim_uid}/{uuid}.ext'를 심으면 admin 서명으로 타인 비공개 파일을 받는다.
-- 방어: 첨부 경로는 반드시 작성자(user_id) 본인 스토리지 폴더 소속이어야 한다
--   (files 버킷 경로 포맷 = '{uid}/{uuid}.{ext}'). null 첨부는 통과(회귀 0).
-- 라우트에도 서명 직전 동일 prefix 검증을 둬 이중 방어한다.
alter table public.meeting_notes drop constraint if exists meeting_notes_attachment_owner;
alter table public.meeting_notes add constraint meeting_notes_attachment_owner
  check (attachment_path is null or starts_with(attachment_path, user_id::text || '/'));
