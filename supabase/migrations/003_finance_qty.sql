-- ============================================================
-- finance_entries 확장 — 엑셀 계산기 구조 반영
-- 갯수(quantity) × 단가(unit_price), 매출 수수료(fee_amount)
-- ============================================================
alter table public.finance_entries
  add column if not exists quantity numeric(14,2),
  add column if not exists unit_price numeric(14,2),
  add column if not exists fee_amount numeric(14,2) not null default 0;
