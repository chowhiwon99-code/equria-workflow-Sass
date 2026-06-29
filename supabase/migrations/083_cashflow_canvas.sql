-- 083: 현금흐름 캔버스 — 박스 메모(짧은 설명) + 회사 가용현금(pool) 캔버스 위치.
--   전부 additive·nullable·멱등. 기존 RLS(078 cash_accounts / 080 cashflow_settings) 그대로 상속. 정책 변경 없음.
alter table public.cash_accounts    add column if not exists note     text;
alter table public.cashflow_settings add column if not exists pool_pos jsonb; -- {"x":380,"y":190}
