-- 050: meeting-media 공개버킷 — 리스팅 허용 SELECT 정책 제거(보안 어드바이저 0025).
--
-- 공개 버킷은 공개 URL(/storage/v1/object/public/...)로 객체를 서빙하므로 storage.objects의
-- SELECT 정책이 없어도 이미지/파일 임베드가 동작한다. mmedia_read(broad SELECT)를 두면
-- 클라이언트가 list()로 버킷 내 전체 파일을 열거할 수 있어 제거한다(인라인 표시엔 영향 없음).
drop policy if exists "mmedia_read" on storage.objects;
