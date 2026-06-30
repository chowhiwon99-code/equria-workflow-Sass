-- 084: 현금흐름 캔버스 그룹 — 기존 cash_categories를 "그룹"으로 재활용(name·color 이미 있음).
--   캔버스 위치(x/y) + 접힘(collapsed) 추가. cash_accounts.category_id(080)=소속 그룹.
--   전부 additive·멱등. 기존 RLS(080) 상속. 그룹은 조직화 레이어 — 순이익 계산엔 무관.
alter table public.cash_categories add column if not exists x         numeric(8,2);
alter table public.cash_categories add column if not exists y         numeric(8,2);
alter table public.cash_categories add column if not exists collapsed boolean not null default false;
