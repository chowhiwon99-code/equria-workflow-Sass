-- 123: 프로젝트 태스크 타임라인 (세션41 대표 요청 — 노션식 상세 타임라인)
-- project_tasks.start_date: 태스크 기간(시작~기한) — 상세 타임라인 바 드래그·기간 조절용(기존 due_date 단일 → 기간)
-- files.project_task_id: 태스크(일정)별 파일 연결 — 타임라인에서 파일 추가/빼기. 태스크 삭제 시 파일은 보존(set null)
-- 롤백: alter table public.project_tasks drop column if exists start_date;
--       alter table public.files drop column if exists project_task_id;

alter table public.project_tasks
  add column if not exists start_date date;

alter table public.files
  add column if not exists project_task_id uuid references public.project_tasks(id) on delete set null;
