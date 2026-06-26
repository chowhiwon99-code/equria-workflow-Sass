-- 079: 현금흐름 "슬롯" 모델 피벗 — cash_accounts를 돈 항목 슬롯으로 사용.
--   슬롯 = 매출(revenue_src)/비용(expense_dst)/보유금(reserve) 항목, amount에 금액을 직접 타이핑.
--   amount 추가(additive·default 0). 기존 컬럼/계좌 모델은 그대로 보존(되돌리기 가능). 멱등.
alter table public.cash_accounts
  add column if not exists amount numeric(18,2) not null default 0;
