-- 132_credits.sql — AI 크레딧 잔액·원장 + 일일 충전(드립)
--
-- 단위: 1 크레딧 = $0.01 원가(내부 기준). agent_usage.cost_usd 를 100배 해서 차감한다.
--
-- 지급 방식(대표 결정):
--   · 무료(free)  : 가입 시 500 지급 → 이후 **매일 DRIP만큼 충전, 잔액 상한 500**.
--                   하루치를 다 써도 다음 날 다시 쓸 수 있어 이탈을 막고, 월 원가 상한은 드립×30일로 고정된다.
--   · 유료        : 월 단위 일괄 지급(이월 없음) — 돈을 낸 쪽은 언제 쓸지가 자유로워야 한다.
--   · premium     : 무제한(협의) — 게이팅하지 않는다.
--
-- 충전은 크론이 아니라 **호출 시점 lazy 계산**(credit_sync)이다. 크론 지연/실패 리스크가 없고,
-- 쓰지 않는 워크스페이스는 아무 비용도 발생하지 않는다. 기준일은 KST.
--
-- 롤백:
--   drop function if exists public.credit_consume(uuid, numeric, text);
--   drop function if exists public.credit_sync(uuid);
--   drop function if exists public.plan_monthly_credits(text);
--   drop table if exists public.credit_ledger;
--   drop table if exists public.workspace_credits;

-- ── 잔액 ─────────────────────────────────────────────────────────────────
create table if not exists public.workspace_credits (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  balance numeric(12,2) not null default 0,
  last_grant_on date,                       -- 마지막 충전 기준일(KST). null이면 최초 지급 전.
  updated_at timestamptz not null default now()
);

-- ── 원장(감사·정산 근거) ──────────────────────────────────────────────────
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  delta numeric(12,2) not null,             -- +충전 / -차감
  reason text not null check (reason in ('signup','drip','monthly','usage','topup','adjust')),
  balance_after numeric(12,2) not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_ws_created_idx
  on public.credit_ledger (workspace_id, created_at desc);

alter table public.workspace_credits enable row level security;
alter table public.credit_ledger enable row level security;

-- 잔액: 멤버는 읽기(잔액/차단 안내 UI). 쓰기는 RPC(security definer)로만 — 클라 직접 변경 불가.
drop policy if exists workspace_credits_select on public.workspace_credits;
create policy workspace_credits_select on public.workspace_credits
  for select using (workspace_id in (select public.auth_user_workspace_ids()));

-- 원장: 오너만(누가 얼마 썼는지는 관리 정보).
drop policy if exists credit_ledger_select on public.credit_ledger;
create policy credit_ledger_select on public.credit_ledger
  for select using (public.auth_is_workspace_owner(workspace_id));

-- ── 플랜별 월 크레딧 (lib/plans.ts 와 반드시 일치) ────────────────────────
-- null = 무제한(게이팅 안 함). 마이그125 plan_seat_limit 과 같은 패턴.
create or replace function public.plan_monthly_credits(p_plan text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case coalesce(p_plan, 'free')
    when 'free' then 500
    when 'standard' then 3000
    when 'pro' then 7000
    when 'premium' then null
    else 500
  end::numeric;
$$;

-- 무료 플랜 일일 충전량과 상한. 월 환산 17×30=510 ≈ 월 500 설계와 동일한 원가 상한.
create or replace function public.free_daily_drip() returns numeric
language sql immutable set search_path = public as $$ select 17::numeric $$;

-- ── 충전(lazy) ───────────────────────────────────────────────────────────
-- 호출 시점에 마지막 충전일 이후 경과분을 계산해 채우고 최신 잔액을 돌려준다.
-- 반환 null = 무제한 플랜(게이팅 없음).
create or replace function public.credit_sync(p_workspace_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_cap numeric;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_bal numeric;
  v_last date;
  v_days int;
  v_add numeric;
begin
  select plan into v_plan from public.workspaces where id = p_workspace_id;
  if not found then
    return 0;
  end if;

  v_cap := public.plan_monthly_credits(v_plan);
  if v_cap is null then
    return null; -- premium = 무제한
  end if;

  insert into public.workspace_credits (workspace_id, balance, last_grant_on)
  values (p_workspace_id, 0, null)
  on conflict (workspace_id) do nothing;

  select balance, last_grant_on into v_bal, v_last
  from public.workspace_credits where workspace_id = p_workspace_id for update;

  -- 최초 지급: 플랜 할당량 전액.
  if v_last is null then
    update public.workspace_credits
      set balance = v_cap, last_grant_on = v_today, updated_at = now()
      where workspace_id = p_workspace_id;
    insert into public.credit_ledger (workspace_id, delta, reason, balance_after)
      values (p_workspace_id, v_cap, 'signup', v_cap);
    return v_cap;
  end if;

  if coalesce(v_plan, 'free') = 'free' then
    -- 무료: 하루 단위 드립, 상한까지만. 이미 상한이면 기준일만 당겨 과충전을 막는다.
    v_days := v_today - v_last;
    if v_days <= 0 then
      return v_bal;
    end if;
    v_add := least(v_days * public.free_daily_drip(), greatest(v_cap - v_bal, 0));
    update public.workspace_credits
      set balance = v_bal + v_add, last_grant_on = v_today, updated_at = now()
      where workspace_id = p_workspace_id;
    if v_add > 0 then
      insert into public.credit_ledger (workspace_id, delta, reason, balance_after, note)
        values (p_workspace_id, v_add, 'drip', v_bal + v_add, v_days || '일분');
    end if;
    return v_bal + v_add;
  else
    -- 유료: 달이 바뀌면 할당량으로 리셋(이월 없음).
    if date_trunc('month', v_today) > date_trunc('month', v_last) then
      update public.workspace_credits
        set balance = v_cap, last_grant_on = v_today, updated_at = now()
        where workspace_id = p_workspace_id;
      insert into public.credit_ledger (workspace_id, delta, reason, balance_after)
        values (p_workspace_id, v_cap - v_bal, 'monthly', v_cap);
      return v_cap;
    end if;
    return v_bal;
  end if;
end;
$$;

-- ── 차감 ─────────────────────────────────────────────────────────────────
-- 스트리밍이라 호출 전엔 비용을 모른다 → 사전엔 잔액>0만 보고, 실제 차감은 응답 완료 후.
-- 마지막 호출이 잔액을 살짝 넘길 수 있고(음수 허용) 그다음 호출에서 차단된다 — 의도된 동작.
create or replace function public.credit_consume(
  p_workspace_id uuid,
  p_credits numeric,
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after numeric;
begin
  if p_credits is null or p_credits <= 0 then
    select balance into v_after from public.workspace_credits where workspace_id = p_workspace_id;
    return v_after;
  end if;

  -- 무제한 플랜은 차감하지 않는다.
  if public.plan_monthly_credits((select plan from public.workspaces where id = p_workspace_id)) is null then
    return null;
  end if;

  update public.workspace_credits
    set balance = balance - p_credits, updated_at = now()
    where workspace_id = p_workspace_id
    returning balance into v_after;

  if v_after is null then
    return null; -- 잔액 행 없음(동기화 전) — 차감 실패는 채팅을 막지 않는다
  end if;

  insert into public.credit_ledger (workspace_id, delta, reason, balance_after, note)
    values (p_workspace_id, -p_credits, 'usage', v_after, p_note);
  return v_after;
end;
$$;

revoke execute on function public.credit_sync(uuid) from public, anon;
revoke execute on function public.credit_consume(uuid, numeric, text) from public, anon;
grant execute on function public.credit_sync(uuid) to authenticated;
grant execute on function public.credit_consume(uuid, numeric, text) to authenticated;
grant execute on function public.plan_monthly_credits(text) to authenticated;
