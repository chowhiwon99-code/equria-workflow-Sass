-- 091: 프로젝트 중요도 — 회의노트(070)의 importance 패턴을 프로젝트에도 이식.
-- 추가형 컬럼(기존 데이터 무영향). 고정 등급 0없음~4긴급(lib/meetingMeta.ts 재사용).
-- 별도 RPC 불필요: projects UPDATE RLS(035)가 created_by/owner_id에게 이미 허용 →
-- 생성자·담당자가 중요도를 인라인 변경 가능.

alter table public.projects add column if not exists importance int not null default 0;
create index if not exists idx_projects_importance on public.projects (workspace_id, importance);
