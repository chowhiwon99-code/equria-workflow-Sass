-- 103: 에이전트 카테고리 자유 입력 정합 — 옛 8개 슬러그만 허용하던 check 제약 제거.
-- 세션34에서 빌더 카테고리를 select→자유입력으로 바꿨는데 DB 제약(agents_category_check)이 남아
-- 목록 밖 값(한글 라벨·커스텀 등) 저장 시 위반. 제약 제거 = 자유 입력과 정합(더 permissive라 기존 데이터 안 깨짐).
alter table public.agents drop constraint if exists agents_category_check;
