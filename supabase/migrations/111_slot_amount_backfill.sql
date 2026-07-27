-- 111: 캔버스 슬롯 금액 → 장부 기록 1회 이관(대표 결정 2026-07-27 · SSOT 재설계).
-- 활성·비ledger·매출/비용·금액≠0 슬롯마다 이번 달 기록 1건(account_id 귀속, vendor/category=슬롯명).
-- 멱등: metadata.slot_migration 가드(재실행 시 0건). ⚠️ 반드시 SSOT 코드(511b311) 배포 후 실행 —
-- 구코드는 이관 기록을 '장부 연동(전체)' 슬롯에 합산해 pool이 이관액만큼 이중 계산됨.
-- 롤백 = delete from finance_entries where metadata->>'slot_migration'='true'.
insert into public.finance_entries
  (kind, entry_date, vendor, description, category, amount, tax_amount, fee_amount,
   total_amount, currency, account_id, source, status, metadata, created_by)
select case when s.kind = 'revenue_src' then 'revenue' else 'expense' end,
       current_date, s.name, '캔버스 항목 이관', s.name,
       s.amount, 0, 0, s.amount, s.currency, s.id, 'manual', 'confirmed',
       jsonb_build_object('slot_migration', true), s.created_by
from public.cash_accounts s
where s.deleted_at is null
  and s.item_type <> 'ledger'
  and s.kind in ('revenue_src', 'expense_dst')
  and s.amount <> 0
  and not exists (
    select 1 from public.finance_entries fe
    where fe.account_id = s.id and fe.metadata->>'slot_migration' = 'true'
  );
