-- 049: meeting-media 버킷 서버측 업로드 크기 제한(50MB).
-- 클라이언트 50MB 가드는 직접 API 호출로 우회 가능하므로 버킷 차원에서 강제한다.
-- (allowed_mime_types는 '모든 형식 허용' 요구와 충돌해 두지 않고, SVG/HTML 같은 활성 콘텐츠는
--  업로드 헬퍼(uploadMeetingMedia)에서 차단한다.)
update storage.buckets set file_size_limit = 52428800 where id = 'meeting-media';
