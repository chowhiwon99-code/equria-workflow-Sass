-- 140_billing_rpc.sql — 결제 처리 로직: 체크아웃·정산·해지·동의·만료
--
-- 마이그139(스키마)와 나눈 이유: 로직은 앞으로 자주 고치게 되는데, 테이블과 한 파일에 있으면
--   롤백이 통째로 묶인다. 여기만 되돌려도 데이터는 남는다.
--
-- ★이 파일의 핵심은 billing_apply_payment 하나다.
--   결제 확정 시 (1)영수증 도장 (2)구독 활성화 (3)workspaces.plan 승급 (4)AI 사용량 즉시 재설정
--   (5)감사 로그를 **한 트랜잭션**으로 처리한다. 앱에서 UPDATE를 5번 나눠 쏘는 방식은 기각했다 —
--   3번과 4번 사이에서 실패하면 "돈은 받았는데 요금제는 그대로"가 영구히 남는다.
--
-- 🔴 금액 위변조 방어 (한국 PG 사고 1순위)
--   결제창 파라미터의 금액은 사용자가 브라우저에서 바꿀 수 있다(100원 결제로 Pro 개통).
--   방어는 하나뿐이다: checkout 시점에 서버가 billing_payments에 'ready' 행으로 금액을 못박고,
--   승인 응답·웹훅·조회 API의 금액을 전부 그 값과 대조한다. 여기서는 amount 불일치 시 **예외**를
--   던지고, 호출부가 즉시 PG 취소 API를 때린다.
--
-- 🔴 멱등성 3중 (하나만으로는 못 막는다)
--   ① billing_payments.order_id unique  — 같은 주문 이중 생성 차단
--   ② billing_payments.tid unique       — 같은 승인이 다른 주문에 붙는 것 차단
--   ③ 아래 RPC의 select ... for update  — 승인응답과 웹훅이 200ms 차로 동시 도착해도 직렬화
--   사용자가 결제창에서 뒤로가기 후 재결제하거나, 나이스페이가 웹훅을 재발송해도 안전하다.
--
-- 🔴 크레딧 즉시 재설정 (없으면 실제 버그)
--   credit_sync는 유료 플랜을 **월 경계에서만** v_cap으로 리셋한다(마이그132). 그래서 8/20에
--   Standard로 승급해도 잔액은 8월 내내 free의 500 그대로다 = "돈 냈는데 그대로".
--   billing_apply_payment가 workspace_credits를 새 상한으로 올리고 credit_ledger에 남긴다.
--   ⚠️ 반대로 **강등 시에는 깎지 않는다** — 이미 받은 이익을 회수하면 분쟁 소재다.
--      (free의 drip 로직이 `least(일수*17, greatest(cap-bal,0))`이라 잔액이 상한을 넘어도
--       음수를 더하지 않으므로, 그냥 두면 자연히 소진된다.)
--
-- 권한: 전부 service_role 전용이다. revoke ... from public, anon, authenticated.
--   credit_sync가 authenticated에 열린 것과 다른 이유 — 저건 자기 워크스페이스 잔액 계산이고
--   이건 돈이다. 인증은 앱(오너 확인)이 하고, 원자성만 DB가 맡는다.
--
-- 안전성: 전부 신규 함수(additive). 기존 함수·데이터 변경 0. 유료 워크스페이스 0개.
--
-- 롤백:
--   drop function if exists public.billing_start_checkout(uuid,text,text,int,int,text,timestamptz,timestamptz);
--   drop function if exists public.billing_apply_payment(text,text,int,timestamptz,jsonb);
--   drop function if exists public.billing_fail_payment(text,text,jsonb);
--   drop function if exists public.billing_request_cancel(uuid,uuid,text);
--   drop function if exists public.billing_revoke_cancel(uuid,uuid);
--   drop function if exists public.billing_record_consent(uuid,uuid,text,jsonb);
--   drop function if exists public.billing_expire_due();

-- ─────────────────────────────────────────────────────────────
-- 1. billing_start_checkout — 결제창 띄우기 **전에** 금액을 못박는다
-- ─────────────────────────────────────────────────────────────
create or replace function public.billing_start_checkout(
  p_workspace_id  uuid,
  p_plan          text,
  p_billing_cycle text,
  p_seats         int,
  p_amount_krw    int,          -- ★ lib/billing/orders.ts quoteAmountKrw()만이 만든다
  p_order_id      text,
  p_period_start  timestamptz,
  p_period_end    timestamptz
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if p_amount_krw is null or p_amount_krw <= 0 then
    raise exception 'invalid amount' using errcode = 'P0001';
  end if;
  if p_plan not in ('standard','pro') then
    raise exception 'invalid plan' using errcode = 'P0001';
  end if;
  if p_period_end <= p_period_start then
    raise exception 'invalid period' using errcode = 'P0001';
  end if;

  insert into public.billing_payments (
    workspace_id, order_id, status, amount_krw, plan, billing_cycle, seats,
    period_start, period_end, pay_source
  ) values (
    p_workspace_id, p_order_id, 'ready', p_amount_krw, p_plan, p_billing_cycle,
    coalesce(p_seats, 0), p_period_start, p_period_end, 'checkout'
  )
  returning id into v_id;

  return v_id;
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 2. billing_apply_payment — ★결제 확정. 이 파일의 핵심.
--    반환: 'applied'(이번에 처리) | 'already'(이미 처리됨 = 재통지 흡수)
-- ─────────────────────────────────────────────────────────────
create or replace function public.billing_apply_payment(
  p_order_id    text,
  p_tid         text,
  p_amount_krw  int,
  p_approved_at timestamptz,
  p_raw         jsonb default '{}'::jsonb
) returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  pay      public.billing_payments;
  v_cap    numeric;
  v_bal    numeric;
begin
  -- ③ 직렬화: 승인응답과 웹훅이 동시에 들어와도 한 줄로 세운다.
  select * into pay from public.billing_payments
   where order_id = p_order_id for update;
  if not found then
    raise exception 'unknown order %', p_order_id using errcode = 'P0001';
  end if;

  -- 재통지 흡수: 이미 처리된 결제는 조용히 no-op.
  if pay.status = 'paid' then
    return 'already';
  end if;
  if pay.status <> 'ready' then
    raise exception 'order % is % (expected ready)', p_order_id, pay.status using errcode = 'P0001';
  end if;

  -- 🔴 금액 대조. 여기가 위변조 방어의 마지막 선이다.
  if p_amount_krw is distinct from pay.amount_krw then
    raise exception 'amount mismatch: expected %, got %', pay.amount_krw, p_amount_krw
      using errcode = 'P0001';
  end if;

  -- (1) 영수증 도장
  update public.billing_payments
     set status = 'paid', tid = p_tid, approved_at = coalesce(p_approved_at, now()), raw = p_raw
   where id = pay.id;

  -- (2) 구독 활성화 (기간은 결제 시점에 계산해 ready 행에 넣어둔 값을 그대로 쓴다)
  insert into public.billing_subscriptions as s (
    workspace_id, plan, status, billing_cycle, paid_seats, amount_krw,
    current_period_start, current_period_end, updated_at
  ) values (
    pay.workspace_id, pay.plan, 'active', pay.billing_cycle, pay.seats, pay.amount_krw,
    pay.period_start, pay.period_end, now()
  )
  on conflict (workspace_id) do update set
    plan                 = excluded.plan,
    status               = 'active',
    billing_cycle        = excluded.billing_cycle,
    paid_seats           = excluded.paid_seats,
    amount_krw           = excluded.amount_krw,
    current_period_start = excluded.current_period_start,
    current_period_end   = excluded.current_period_end,
    retry_count          = 0,
    -- 재결제하면 해지 예약은 풀린다(사용자 의사 변경으로 본다).
    cancel_requested_at  = null,
    cancel_effective_at  = null,
    cancel_reason        = null,
    updated_at           = now();

  -- (3) 요금제 승급
  update public.workspaces set plan = pay.plan where id = pay.workspace_id;

  -- (4) 🔴 AI 사용량 즉시 재설정. 없으면 "돈 냈는데 그대로"가 된다.
  v_cap := public.plan_monthly_credits(pay.plan);
  if v_cap is not null then
    -- ⚠️ 잔액 행을 **0으로** 만든다. v_cap으로 만들면 바로 아래 `v_bal < v_cap`이 거짓이 되어
    --    credit_ledger 기록이 통째로 누락된다(2026-08-18 시뮬에서 실측: 잔액은 750인데 장부 0건).
    --    잔액이 어디서 왔는지 추적할 수 없게 되므로 반드시 0으로 만들고 아래에서 올린다.
    insert into public.workspace_credits (workspace_id, balance, last_grant_on)
    values (pay.workspace_id, 0, null)
    on conflict (workspace_id) do nothing;

    select balance into v_bal from public.workspace_credits
     where workspace_id = pay.workspace_id for update;

    if v_bal < v_cap then
      -- 승급: 상한까지 올리고 장부에 남긴다.
      update public.workspace_credits
         set balance = v_cap, last_grant_on = (now() at time zone 'Asia/Seoul')::date, updated_at = now()
       where workspace_id = pay.workspace_id;
      insert into public.credit_ledger (workspace_id, delta, reason, balance_after, note)
      values (pay.workspace_id, v_cap - v_bal, 'adjust', v_cap, '결제 승인(' || pay.plan || ')');
    else
      -- 잔액이 이미 상한 이상이면 **깎지 않는다**(이미 준 이익 회수는 분쟁 소재).
      -- 다만 last_grant_on은 갱신한다 — null로 두면 credit_sync가 "최초 지급"으로 오인해
      -- 잔액을 v_cap으로 **낮춰버린다**(마이그132의 `if v_last is null` 분기).
      update public.workspace_credits
         set last_grant_on = (now() at time zone 'Asia/Seoul')::date, updated_at = now()
       where workspace_id = pay.workspace_id;
    end if;
  end if;

  -- (5) 감사 로그
  insert into public.billing_events (workspace_id, kind, payload)
  values (pay.workspace_id, 'reconciled',
          jsonb_build_object('order_id', p_order_id, 'tid', p_tid,
                             'amount_krw', p_amount_krw, 'plan', pay.plan));

  return 'applied';
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 3. billing_fail_payment — 승인 실패/취소된 시도를 닫는다(대사 크론도 사용)
-- ─────────────────────────────────────────────────────────────
create or replace function public.billing_fail_payment(
  p_order_id text,
  p_reason   text default null,
  p_raw      jsonb default '{}'::jsonb
) returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare pay public.billing_payments;
begin
  select * into pay from public.billing_payments where order_id = p_order_id for update;
  if not found then return 'unknown'; end if;
  if pay.status = 'paid' then return 'already_paid'; end if;   -- 승인된 건은 실패로 못 바꾼다
  if pay.status <> 'ready' then return 'noop'; end if;

  update public.billing_payments
     set status = 'failed', refund_reason = p_reason, raw = p_raw
   where id = pay.id;
  return 'failed';
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 4. billing_record_consent — 법적 의무① 자동결제 별도 동의
--    계약 제22조 ③: 위반 시 이용자 민원·손배가 전부 가맹점 부담이다.
--    시각·약관버전·IP·UA를 남기는 게 유일한 방어라 payload를 통째로 보관한다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.billing_record_consent(
  p_workspace_id  uuid,
  p_user_id       uuid,
  p_terms_version text,
  p_payload       jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.billing_subscriptions
     set consent_auto_billing_at = now(),
         consent_terms_version   = p_terms_version,
         updated_at              = now()
   where workspace_id = p_workspace_id;

  insert into public.billing_events (workspace_id, kind, actor_id, payload)
  values (p_workspace_id, 'consent_auto_billing', p_user_id,
          p_payload || jsonb_build_object('terms_version', p_terms_version));
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 5. billing_request_cancel — 법적 의무③ 24시간 해지
--    즉시 종료가 아니라 기간 만료 방식이다. /refund 제2조 1항이
--    "해지 시 다음 결제일부터 중단, 이미 결제된 기간은 만료일까지 이용"이라 공표돼 있다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.billing_request_cancel(
  p_workspace_id uuid,
  p_user_id      uuid,
  p_reason       text default null
) returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_end timestamptz;
begin
  update public.billing_subscriptions
     set cancel_requested_at = coalesce(cancel_requested_at, now()),  -- 최초 접수 시각을 보존(증빙)
         cancel_effective_at = current_period_end,
         cancel_reason       = coalesce(p_reason, cancel_reason),
         auto_renew          = false,
         next_charge_at      = null,
         updated_at          = now()
   where workspace_id = p_workspace_id
     and status in ('active','past_due')
  returning current_period_end into v_end;

  if v_end is null then
    raise exception 'no active subscription' using errcode = 'P0001';
  end if;

  insert into public.billing_events (workspace_id, kind, actor_id, payload)
  values (p_workspace_id, 'cancel_requested', p_user_id,
          jsonb_build_object('effective_at', v_end, 'reason', p_reason));

  return v_end;
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 6. billing_revoke_cancel — 해지 철회(마음이 바뀐 경우)
-- ─────────────────────────────────────────────────────────────
create or replace function public.billing_revoke_cancel(
  p_workspace_id uuid,
  p_user_id      uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.billing_subscriptions
     set cancel_requested_at = null,
         cancel_effective_at = null,
         cancel_reason       = null,
         updated_at          = now()
   where workspace_id = p_workspace_id
     and status in ('active','past_due');

  insert into public.billing_events (workspace_id, kind, actor_id)
  values (p_workspace_id, 'cancel_revoked', p_user_id);
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 7. billing_expire_due — 크론: 해지 예정일·기간 만료가 도래한 구독을 닫는다
--    ⚠️ 크레딧은 깎지 않는다(강등 시 회수 금지). free의 drip이 상한 초과분을 더하지 않으므로
--       자연히 소진된다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.billing_expire_due()
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; n int := 0;
begin
  for r in
    select workspace_id, cancel_effective_at
      from public.billing_subscriptions
     where status in ('active','past_due')
       and cancel_effective_at is not null
       and cancel_effective_at <= now()
     for update
  loop
    update public.billing_subscriptions
       set status = 'canceled', updated_at = now()
     where workspace_id = r.workspace_id;

    update public.workspaces set plan = 'free' where id = r.workspace_id;

    insert into public.billing_events (workspace_id, kind, payload)
    values (r.workspace_id, 'cancel_effected',
            jsonb_build_object('effective_at', r.cancel_effective_at));
    n := n + 1;
  end loop;
  return n;
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 8. 권한 — 전부 service_role 전용. 앱은 admin client로만 호출한다.
-- ─────────────────────────────────────────────────────────────
revoke execute on function public.billing_start_checkout(uuid,text,text,int,int,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke execute on function public.billing_apply_payment(text,text,int,timestamptz,jsonb)                      from public, anon, authenticated;
revoke execute on function public.billing_fail_payment(text,text,jsonb)                                       from public, anon, authenticated;
revoke execute on function public.billing_record_consent(uuid,uuid,text,jsonb)                                from public, anon, authenticated;
revoke execute on function public.billing_request_cancel(uuid,uuid,text)                                      from public, anon, authenticated;
revoke execute on function public.billing_revoke_cancel(uuid,uuid)                                            from public, anon, authenticated;
revoke execute on function public.billing_expire_due()                                                        from public, anon, authenticated;
