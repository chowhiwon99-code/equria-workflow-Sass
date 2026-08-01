-- 127: 죽은 컬럼 정리 — workspaces.finance_snapshot_open 제거 (known-issues I22)
-- 마이그121에서 대시보드 손익 스냅샷 공개 토글용으로 추가했으나, 세션41 대시보드 개편(6349e84)에서
-- 해당 기능(FinanceSnapshot 필/최근기록) 제거로 완전 미사용. 코드 참조 0(생성 types.ts 제외)·
-- RLS 정책/함수/뷰/제약 의존성 전부 0(검증 완료)·workspaces UPDATE 정책 부재라 위험 0.
-- 롤백: alter table public.workspaces add column if not exists finance_snapshot_open boolean not null default false;

alter table public.workspaces drop column if exists finance_snapshot_open;
