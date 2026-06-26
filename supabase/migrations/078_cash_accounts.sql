-- 078: 현금흐름 지도 — 계좌/버킷(잔액 보유) + 내부 이체 + finance_entries.account_id 링크.
--   전부 additive/nullable. 기존 FinanceView·035 RLS 무영향. 멱등. workspace_id DEFAULT=equria(030 패턴).
--   RLS = finance_entries(035) 패턴 복제: select/update/delete=auth_user_workspace_ids(), insert=is_workspace_member().
--   잔액은 저장하지 않고 클라가 계산(opening ± entries ± transfers, 통화별 분리).

-- ── 1) 계좌/버킷(흐름도 노드) — 사용자 정의(추가/이름/색/정렬), 잔액 보유 ──
create table if not exists public.cash_accounts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null default '00000000-0000-0000-0000-0000000000e1'
                    references public.workspaces(id) on delete cascade,
  name            text not null,
  -- 버킷 종류: cash 현금 / bank 통장 / card 카드 / reserve 사내보유금 / revenue_src 매출처 / expense_dst 지출처 / other
  kind            text not null default 'bank'
                    check (kind in ('cash','bank','card','reserve','revenue_src','expense_dst','other')),
  currency        text not null default 'KRW',
  opening_balance numeric(18,2) not null default 0,     -- 기초잔액
  color           text not null default 'gray',          -- meetingMeta CATEGORY_COLORS 토큰 재사용
  x               numeric(8,2),                           -- 다이어그램 좌표(없으면 클라가 격자 배치)
  y               numeric(8,2),
  sort_order      int  not null default 0,
  parent_id       uuid references public.cash_accounts(id) on delete set null,  -- 미래 중첩(P3)
  deleted_at      timestamptz,                            -- 소프트삭제(011 패턴)
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_cash_accounts_ws
  on public.cash_accounts (workspace_id, sort_order) where deleted_at is null;

-- ── 2) finance_entries → 어떤 계좌에 꽂히나(매출=입금처 / 비용=출금처). nullable=기존 행 보존 ──
alter table public.finance_entries
  add column if not exists account_id uuid references public.cash_accounts(id) on delete set null;
create index if not exists idx_finance_entries_account
  on public.finance_entries (account_id) where deleted_at is null;

-- ── 3) 내부 이체(내 계좌 ↔ 내 계좌) — 매출/비용 아님(잔액만 이동). ──
create table if not exists public.cash_transfers (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null default '00000000-0000-0000-0000-0000000000e1'
                    references public.workspaces(id) on delete cascade,
  transfer_date   date not null default current_date,
  from_account_id uuid not null references public.cash_accounts(id) on delete cascade,
  to_account_id   uuid not null references public.cash_accounts(id) on delete cascade,
  amount          numeric(18,2) not null default 0,
  currency        text not null default 'KRW',
  fee_amount      numeric(18,2) not null default 0,       -- 이체 수수료(보내는 쪽 추가 차감)
  memo            text,
  deleted_at      timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);
create index if not exists idx_cash_transfers_ws
  on public.cash_transfers (workspace_id, transfer_date desc) where deleted_at is null;

-- ── 4) RLS — finance_entries(035) 패턴 그대로 ──
alter table public.cash_accounts  enable row level security;
alter table public.cash_transfers enable row level security;

drop policy if exists ca_select on public.cash_accounts;
create policy ca_select on public.cash_accounts for select
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists ca_insert on public.cash_accounts;
create policy ca_insert on public.cash_accounts for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists ca_update on public.cash_accounts;
create policy ca_update on public.cash_accounts for update
  using (workspace_id in (select public.auth_user_workspace_ids()))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists ca_delete on public.cash_accounts;
create policy ca_delete on public.cash_accounts for delete
  using (workspace_id in (select public.auth_user_workspace_ids()));

drop policy if exists ct_select on public.cash_transfers;
create policy ct_select on public.cash_transfers for select
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists ct_insert on public.cash_transfers;
create policy ct_insert on public.cash_transfers for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists ct_update on public.cash_transfers;
create policy ct_update on public.cash_transfers for update
  using (workspace_id in (select public.auth_user_workspace_ids()))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists ct_delete on public.cash_transfers;
create policy ct_delete on public.cash_transfers for delete
  using (workspace_id in (select public.auth_user_workspace_ids()));
