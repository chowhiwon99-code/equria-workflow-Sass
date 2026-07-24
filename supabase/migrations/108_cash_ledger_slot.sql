-- 108: 현금흐름 장부 연동 슬롯 — item_type 'ledger' 허용.
-- 배경(대표 2026-07-24): "요약(실제 장부)과 현금흐름(계산기)이 안 맞는다" → 장부 합계가 계산기 슬롯으로
-- 자동 반영되는 연동 슬롯 도입. amount는 클라(CashFlowView 로드 시)가 이번 달 finance_entries 합계로 동기화.
-- 추가형·멱등(제약 재생성). 롤백 = check를 ('fixed','qty','channel')로 되돌림(ledger 슬롯 먼저 삭제/전환).
alter table public.cash_accounts drop constraint if exists cash_accounts_item_type_check;
alter table public.cash_accounts add constraint cash_accounts_item_type_check
  check (item_type in ('fixed','qty','channel','ledger'));
comment on column public.cash_accounts.item_type is
  'fixed=직접 입력 · qty=개수×단가 · channel=채널 판매 · ledger=장부 자동(이번 달 finance_entries 합계 동기화)';
