-- 052: finance_entries 다중 화폐 — 비용/매출을 KRW 외 USD·EUR·JPY·CNY·BTC 등으로 기록.
-- 기본값 KRW로 기존 행 보존(회귀 0). 표시/합계는 통화별로 분리(서로 다른 통화는 합산하지 않음).
alter table public.finance_entries add column if not exists currency text not null default 'KRW';
