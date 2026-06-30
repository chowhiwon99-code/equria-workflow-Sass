-- 085: 회사 "기본 계산 유형" — 표의 계산 칸(필드)을 회사가 직접 편집·추가/삭제할 수 있게.
--   cashflow_settings가 기본으로 쓸 cash_calc_types 행을 가리킴. 앱이 없으면 1회 시드.
--   additive·멱등. 기존 RLS(080) 상속. 유형 삭제 시 NULL(다시 시드됨).
alter table public.cashflow_settings
  add column if not exists default_calc_type_id uuid references public.cash_calc_types(id) on delete set null;
