-- 082: 사용자 정의 계산 유형 — 회사가 필드+수식(AST)을 직접 정의. 앱 그리드/엑셀 동일 결과.
--   cash_calc_types(이름·flow·fields·formula) + cash_accounts.calc_type_id + field_values(임의 N필드 값).
--   레거시 units/unit_price/rate/extra 유지(빌트인·기존 행 무회귀). 전부 additive·멱등. RLS=cash_categories(080) 패턴.
--   주: 컬럼명 values는 SQL 예약어라 field_values 사용.

create table if not exists public.cash_calc_types (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1' references public.workspaces(id) on delete cascade,
  name         text not null,
  flow         text not null default 'expense' check (flow in ('revenue','expense','reserve')),
  fields       jsonb not null default '[]'::jsonb, -- CalcField[]
  formula      jsonb not null default '{}'::jsonb, -- { ast }
  sort_order   int  not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_cash_calc_types_ws on public.cash_calc_types (workspace_id, sort_order);

alter table public.cash_accounts add column if not exists calc_type_id uuid references public.cash_calc_types(id) on delete set null;
alter table public.cash_accounts add column if not exists field_values jsonb not null default '{}'::jsonb;

alter table public.cash_calc_types enable row level security;
drop policy if exists cct_select on public.cash_calc_types;
create policy cct_select on public.cash_calc_types for select using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists cct_insert on public.cash_calc_types;
create policy cct_insert on public.cash_calc_types for insert with check (public.is_workspace_member(workspace_id));
drop policy if exists cct_update on public.cash_calc_types;
create policy cct_update on public.cash_calc_types for update using (workspace_id in (select public.auth_user_workspace_ids())) with check (public.is_workspace_member(workspace_id));
drop policy if exists cct_delete on public.cash_calc_types;
create policy cct_delete on public.cash_calc_types for delete using (workspace_id in (select public.auth_user_workspace_ids()));
