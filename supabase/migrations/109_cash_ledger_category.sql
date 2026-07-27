-- 109: 장부 연동 슬롯의 분류 필터 — 손익 탭 통일(대표 결정 2026-07-27)의 후속.
-- ledger 슬롯이 장부 전체 합계가 아니라 특정 분류(예: 식비)만 자동 반영할 수 있게.
-- null=전체(현행 동작 유지). 추가형·멱등. 롤백=drop column.
alter table public.cash_accounts add column if not exists ledger_category text;
comment on column public.cash_accounts.ledger_category is
  'item_type=ledger 전용 — 이번 달 finance_entries 중 이 분류만 합산(null=전체). 예: 식비';
