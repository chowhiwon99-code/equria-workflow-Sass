-- 081: 현금흐름 → 손익 계산기. cash_accounts 행을 "계산되는 항목"으로.
--   item_type: fixed(금액 직접) / qty(갯수×단가) / channel(판매수×(단가×(1−수수료)−택배비)).
--   units(판매수/갯수)·unit_price(단가)·rate(수수료율 0–1)·extra(택배비/부가세). amount = 계산 결과(클라가 기록).
--   전부 additive·default. 기존 슬롯 → item_type 'fixed'(현 amount 유지) = 무회귀. 멱등. (079 패턴)
alter table public.cash_accounts add column if not exists units      numeric(18,2) not null default 0;
alter table public.cash_accounts add column if not exists unit_price numeric(18,2) not null default 0;
alter table public.cash_accounts add column if not exists rate       numeric(6,4)  not null default 0;
alter table public.cash_accounts add column if not exists extra      numeric(18,2) not null default 0;
alter table public.cash_accounts add column if not exists item_type  text not null default 'fixed'
  check (item_type in ('fixed','qty','channel'));
