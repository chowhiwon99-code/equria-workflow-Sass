-- 124: 태스크 색상 (세션41 대표 요청 — 타임라인 바 색상 선택)
-- null = 상태 기본색(완료 초록/지남 빨강/진행 파랑), 값 = CATEGORY_COLORS 팔레트 키(meetingMeta swatch)
-- 롤백: alter table public.project_tasks drop column if exists color;

alter table public.project_tasks
  add column if not exists color text;
