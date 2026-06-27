-- 080: 현금흐름 v2 — 회사별 커스텀 카테고리 + 보유현금/기본통화 설정.
--   cash_categories: 슬롯 "구분"을 회사가 정의(이름·flow 매출/비용/보유·색).
--   cash_accounts.category_id: 슬롯→카테고리 링크(nullable; flow는 카테고리에서).
--   cashflow_settings: 워크스페이스당 1행(시작 보유현금 통화별·기본통화).
--   전부 additive·nullable·멱등. RLS = workspace 격리(멤버 편집, cash_accounts/meeting_categories 동일).
--   주: 현재 로그인=합성 워크스페이스 계정(…@equria.local)이라 로그인 사용자≠owner_id → 설정도 멤버 편집(단일 테넌트 안전). owner 전용은 B2 때.

-- 1) 커스텀 카테고리
create table if not exists public.cash_categories (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1' references public.workspaces(id) on delete cascade,
  name         text not null,
  flow         text not null default 'expense' check (flow in ('revenue','expense','reserve')),
  color        text not null default 'gray',
  sort_order   int  not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_cash_categories_ws on public.cash_categories (workspace_id, sort_order);

-- 2) 슬롯 → 카테고리 링크
alter table public.cash_accounts add column if not exists category_id uuid references public.cash_categories(id) on delete set null;

-- 3) 회사 설정(시작 보유현금·기본통화) — 워크스페이스당 1행
create table if not exists public.cashflow_settings (
  workspace_id     uuid primary key default '00000000-0000-0000-0000-0000000000e1' references public.workspaces(id) on delete cascade,
  opening_cash     jsonb not null default '{}'::jsonb,   -- {"KRW": 10000000, ...}
  default_currency text  not null default 'KRW',
  updated_by       uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now()
);

-- RLS (workspace 격리, 멤버 편집)
alter table public.cash_categories  enable row level security;
alter table public.cashflow_settings enable row level security;

drop policy if exists cc_select on public.cash_categories;
create policy cc_select on public.cash_categories for select using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists cc_insert on public.cash_categories;
create policy cc_insert on public.cash_categories for insert with check (public.is_workspace_member(workspace_id));
drop policy if exists cc_update on public.cash_categories;
create policy cc_update on public.cash_categories for update using (workspace_id in (select public.auth_user_workspace_ids())) with check (public.is_workspace_member(workspace_id));
drop policy if exists cc_delete on public.cash_categories;
create policy cc_delete on public.cash_categories for delete using (workspace_id in (select public.auth_user_workspace_ids()));

drop policy if exists cfs_select on public.cashflow_settings;
create policy cfs_select on public.cashflow_settings for select using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists cfs_insert on public.cashflow_settings;
create policy cfs_insert on public.cashflow_settings for insert with check (public.is_workspace_member(workspace_id));
drop policy if exists cfs_update on public.cashflow_settings;
create policy cfs_update on public.cashflow_settings for update using (workspace_id in (select public.auth_user_workspace_ids())) with check (public.is_workspace_member(workspace_id));
