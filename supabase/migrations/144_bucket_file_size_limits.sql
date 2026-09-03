-- 144: files·chat-files·receipts·business-cards·calendar-files 버킷 서버측 업로드 크기 제한(50MB).
-- 마이그049(meeting-media)와 같은 패턴 — 클라이언트 가드는 API 직접호출로 우회 가능하므로
-- 버킷 차원에서 강제한다. Supabase Free 스토리지 1GB를 파일 하나가 독식하지 못하게 막는 방어선
-- (docs/ops/infra-limits.md "무료 개방 전 선행" §버킷별 파일 크기 상한).
-- 롤백: update storage.buckets set file_size_limit = null where id in ('files','chat-files','receipts','business-cards','calendar-files');
update storage.buckets
set file_size_limit = 52428800
where id in ('files', 'chat-files', 'receipts', 'business-cards', 'calendar-files');
