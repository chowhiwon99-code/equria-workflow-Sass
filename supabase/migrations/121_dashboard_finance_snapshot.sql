-- 121: 대시보드 손익 스냅샷 공개 설정 (세션41 랜딩 디자인 통일 — 대시보드 목업 정합)
-- 손익 요약 필(매출/비용/순이익)+최근 기록을 대시보드에 노출할 범위 제어.
-- false(기본) = 관리자/오너만 · true = 전 직원 공개(게스트는 항상 숨김 — UI 게이팅).
-- ※ finance_entries RLS(fin_select)는 워크스페이스 멤버 전체 읽기라 이 토글은 UI 레벨(신규 노출 아님 — 재무 탭에서 이미 열람 가능).
-- 롤백: alter table public.workspaces drop column if exists finance_snapshot_open;

alter table public.workspaces
  add column if not exists finance_snapshot_open boolean not null default false;
