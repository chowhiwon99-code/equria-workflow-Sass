-- 141_billing_recovery.sql — 승인 유실 복구 · 기간 만료 · 7일 전 고지
--
-- 왜 필요한가 — 마이그140을 짤 때는 나이스페이 **조회 API·결제통보 규격을 못 본 상태**였다.
-- 2026-08-19에 공식 문서(developers.nicepay.co.kr/manual-status.php · manual-noti.php)를
-- 확인하면서 구멍 3개가 드러났다.
--
-- 🔴 ① 승인은 됐는데 우리가 못 받은 결제를 복구할 수 없다 (= 돈만 빠지는 경로)
--    /api/billing/nicepay/return이 승인 API를 호출하는 도중 응답이 유실되면(타임아웃·502)
--    나이스페이 쪽은 **승인 완료**인데 우리는 실패로 처리한다. 이걸 알려주는 유일한 수단이
--    결제통보(노티)인데(규격 확인: 최대 10회 · 1~10분 간격 재전송), 마이그140의
--    billing_apply_payment는 status <> 'ready'면 예외를 던져 **복구 자체가 막혀 있었다.**
--    → 'failed' → 'paid' 전이를 허용한다.
--    ⚠️ 이게 "실패한 결제를 성공으로 뒤집는" 구멍이 되지 않는 이유:
--       (a) 금액 대조(amount mismatch 예외)가 그대로 남아 있고,
--       (b) tid unique + select for update 도 그대로이며,
--       (c) 앱은 **PG 조회 API가 Status='0'(승인)이라고 답한 경우에만** 이 함수를 부른다.
--       셋 다 통과하려면 우리 MID로 실제 승인된 거래여야 한다.
--
-- 🔴 ② 기간이 끝난 구독을 아무도 닫지 않는다 (= 한 번 결제로 평생 이용)
--    billing_expire_due()는 **해지 예약(cancel_effective_at)** 만 본다. 빌링키가 아직 없어
--    지금 모든 구독은 auto_renew=false인데, current_period_end가 지나도 status='active'와
--    workspaces.plan='pro'가 영원히 남는다.
--    → billing_lapse_due(): active + 기간만료 → past_due(유예·플랜 유지) → 유예도 끝나면 expired + free.
--    유예를 두는 이유는 BILLING-PLAN 함정 3번 — 한도초과·카드 재발급은 정상 빈도라 즉시 강등하면
--    좌석 초과 팀이 데이터 접근을 잃는다.
--
-- 🔴 ③ 법적 의무②(결제 7일 전 고지)를 보내는 코드가 없다
--    → billing_notice_upcoming(): 7일 안에 청구/만료 예정인 구독의 오너에게 알림 1건 +
--      billing_events에 증빙. 채널은 앱 내 알림으로 시작한다(대표 결정 2026-08-18).
--
-- 그리고 ④ 결제창을 띄웠지만 끝내 승인되지 않은 'ready' 행을 정리하는 함수(billing_fail_stale_checkouts).
--    ⚠️ 정리 기한을 30분이 아니라 **6시간 기본값**으로 잡은 이유: 노티 재전송이 최대 10회·최대
--       10분 간격이라 최악 100분까지 늦게 도착한다. 30분에 닫으면 늦게 온 진짜 승인을 놓친다.
--       (①로 failed → paid 복구가 열렸으니 일찍 닫아도 치명적이진 않지만, 굳이 서두를 이유가 없다.)
--
-- 안전성: ①은 기존 함수 교체(가드 1줄 완화, 나머지 본문 동일), ②③④는 신규 함수.
--   테이블 변경은 billing_events.kind 화이트리스트에 2개 추가뿐이며 **기존 11개를 전부 재선언**한다
--   (마이그139·104 관례 — 하나라도 빠뜨리면 기존 로그 삽입이 깨진다).
--   유료 워크스페이스 0개 · billing_subscriptions 0행이라 데이터 영향 없음.
--
-- 롤백:
--   -- ①: 마이그140의 billing_apply_payment 정의를 그대로 다시 실행한다(create or replace).
--   drop function if exists public.billing_lapse_due(int);
--   drop function if exists public.billing_notice_upcoming(int);
--   drop function if exists public.billing_fail_stale_checkouts(int);
--   alter table public.billing_events drop constraint billing_events_kind_check;
--   alter table public.billing_events add constraint billing_events_kind_check
--     check (kind in ('consent_auto_billing','consent_withdrawn','notice_upcoming','notice_price_change',
--                     'cancel_requested','cancel_revoked','cancel_effected','refund_issued',
--                     'webhook_received','reconciled','renew_failed'));

-- ─────────────────────────────────────────────────────────────
-- 0. billing_events.kind 화이트리스트 확장 (기존 11개 전부 재선언 + 2개 추가)
-- ─────────────────────────────────────────────────────────────
alter table public.billing_events drop constraint if exists billing_events_kind_check;
alter table public.billing_events add constraint billing_events_kind_check
  check (kind in (
    'consent_auto_billing','consent_withdrawn',
    'notice_upcoming','notice_price_change',
    'cancel_requested','cancel_revoked','cancel_effected',
    'refund_issued','webhook_received','reconciled','renew_failed',
    -- ↓ 141 추가
    'renew_lapsed',          -- 기간이 끝났는데 갱신되지 않음 → 유예(past_due) 진입
    'subscription_expired'   -- 유예까지 끝나 구독 종료 → workspaces.plan='free'
  ));

-- ─────────────────────────────────────────────────────────────
-- 1. billing_apply_payment 교체 — 'failed' → 'paid' 복구 허용
--    ★마이그140 본문과 **가드 한 줄**만 다르다. 나머지(금액 대조·구독 활성화·플랜 승급·
--      사용량 재설정·감사로그)는 글자 그대로 같다.
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
  pay       public.billing_payments;
  v_cap     numeric;
  v_bal     numeric;
  v_recovered boolean := false;
begin
  -- 직렬화: 승인응답과 노티가 동시에 들어와도 한 줄로 세운다.
  select * into pay from public.billing_payments
   where order_id = p_order_id for update;
  if not found then
    raise exception 'unknown order %', p_order_id using errcode = 'P0001';
  end if;

  -- 재통지 흡수: 이미 처리된 결제는 조용히 no-op.
  if pay.status = 'paid' then
    return 'already';
  end if;

  -- 🔴 141 변경점: 'failed'도 받는다.
  --    승인 API 응답을 우리가 못 받아 실패로 닫힌 건을, 나중에 도착한 결제통보(노티)가
  --    PG 조회 API 확인을 거쳐 되살리는 유일한 경로다. 금액 대조는 아래에서 그대로 한다.
  if pay.status not in ('ready','failed') then
    raise exception 'order % is % (expected ready or failed)', p_order_id, pay.status using errcode = 'P0001';
  end if;
  v_recovered := (pay.status = 'failed');

  -- 🔴 금액 대조. 위변조 방어의 마지막 선(ready 시점에 못박은 값과 비교).
  if p_amount_krw is distinct from pay.amount_krw then
    raise exception 'amount mismatch: expected %, got %', pay.amount_krw, p_amount_krw
      using errcode = 'P0001';
  end if;

  -- (1) 영수증 도장. 복구 건이면 실패 사유는 지우지 않고 남긴다(무엇이 있었는지가 증빙이다).
  update public.billing_payments
     set status = 'paid', tid = p_tid, approved_at = coalesce(p_approved_at, now()), raw = p_raw
   where id = pay.id;

  -- (2) 구독 활성화
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
    -- 새 기간이 시작됐으니 이전 기간의 고지 이력은 리셋한다.
    -- (안 지우면 billing_notice_upcoming의 `last_notice_sent_at < current_period_start` 조건이
    --  이미 참이라 문제없지만, 의미를 명시적으로 남긴다.)
    last_notice_sent_at  = null,
    updated_at           = now();

  -- (3) 요금제 승급
  update public.workspaces set plan = pay.plan where id = pay.workspace_id;

  -- (4) 🔴 AI 사용량 즉시 재설정. 없으면 "돈 냈는데 그대로"가 된다.
  v_cap := public.plan_monthly_credits(pay.plan);
  if v_cap is not null then
    -- ⚠️ 잔액 행을 **0으로** 만든다(마이그140 주석 그대로 — v_cap으로 만들면 장부가 누락된다).
    insert into public.workspace_credits (workspace_id, balance, last_grant_on)
    values (pay.workspace_id, 0, null)
    on conflict (workspace_id) do nothing;

    select balance into v_bal from public.workspace_credits
     where workspace_id = pay.workspace_id for update;

    if v_bal < v_cap then
      update public.workspace_credits
         set balance = v_cap, last_grant_on = (now() at time zone 'Asia/Seoul')::date, updated_at = now()
       where workspace_id = pay.workspace_id;
      insert into public.credit_ledger (workspace_id, delta, reason, balance_after, note)
      values (pay.workspace_id, v_cap - v_bal, 'adjust', v_cap, '결제 승인(' || pay.plan || ')');
    else
      -- 잔액이 이미 상한 이상이면 깎지 않는다. last_grant_on은 갱신해야 credit_sync가
      -- "최초 지급"으로 오인해 잔액을 낮추지 않는다(마이그132 `if v_last is null` 분기).
      update public.workspace_credits
         set last_grant_on = (now() at time zone 'Asia/Seoul')::date, updated_at = now()
       where workspace_id = pay.workspace_id;
    end if;
  end if;

  -- (5) 감사 로그. 복구 건은 recovered_from_failed를 남긴다(왜 실패가 성공이 됐는지 추적용).
  insert into public.billing_events (workspace_id, kind, payload)
  values (pay.workspace_id, 'reconciled',
          jsonb_build_object('order_id', p_order_id, 'tid', p_tid,
                             'amount_krw', p_amount_krw, 'plan', pay.plan,
                             'recovered_from_failed', v_recovered));

  return case when v_recovered then 'recovered' else 'applied' end;
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 2. billing_fail_stale_checkouts — 끝내 승인되지 않은 'ready' 행 정리
--    결제창을 띄웠다가 닫은 경우가 대부분이다. 닫아두지 않으면 대사 대상이 무한정 쌓인다.
--    ⚠️ 여기서 닫혀도 나중에 노티가 오면 billing_apply_payment(위 ①)가 되살린다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.billing_fail_stale_checkouts(p_minutes int default 360)
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; n int := 0;
begin
  if p_minutes is null or p_minutes < 30 then
    -- 안전장치: 너무 짧게 부르면 진행 중인 결제를 닫아버린다.
    raise exception 'p_minutes must be >= 30' using errcode = 'P0001';
  end if;

  for r in
    select id from public.billing_payments
     where status = 'ready'
       and created_at <= now() - make_interval(mins => p_minutes)
     for update
  loop
    update public.billing_payments
       set status = 'failed',
           refund_reason = coalesce(refund_reason, 'timeout:no_approval')
     where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 3. billing_lapse_due — 기간 만료 처리 (2단계: 유예 → 종료)
--    반환: {"lapsed": n, "expired": m}
--    ⚠️ 해지 예약 건(cancel_effective_at)은 billing_expire_due()가 담당하므로 여기선 제외한다.
--       둘이 같은 행을 건드리면 "해지"와 "만료"가 이중 기록된다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.billing_lapse_due(p_grace_days int default 3)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; v_lapsed int := 0; v_expired int := 0;
begin
  if p_grace_days is null or p_grace_days < 3 then
    -- BILLING-PLAN 함정 3 — 유예 최소 3일. 즉시 강등은 좌석 초과 팀의 데이터 접근을 끊는다.
    raise exception 'p_grace_days must be >= 3' using errcode = 'P0001';
  end if;

  -- 1단계: 기간이 끝났는데 갱신되지 않음 → past_due (★플랜은 유지한다)
  for r in
    select workspace_id, current_period_end, auto_renew
      from public.billing_subscriptions
     where status = 'active'
       and cancel_effective_at is null
       and current_period_end <= now()
     for update
  loop
    update public.billing_subscriptions
       set status = 'past_due', retry_count = retry_count + 1, updated_at = now()
     where workspace_id = r.workspace_id;

    insert into public.billing_events (workspace_id, kind, payload)
    values (r.workspace_id, 'renew_lapsed',
            jsonb_build_object('period_end', r.current_period_end,
                               'auto_renew', r.auto_renew,
                               'grace_days', p_grace_days));
    v_lapsed := v_lapsed + 1;
  end loop;

  -- 2단계: 유예까지 지남 → expired + free
  for r in
    select workspace_id, current_period_end
      from public.billing_subscriptions
     where status = 'past_due'
       and cancel_effective_at is null
       and current_period_end + make_interval(days => p_grace_days) <= now()
     for update
  loop
    update public.billing_subscriptions
       set status = 'expired', auto_renew = false, next_charge_at = null, updated_at = now()
     where workspace_id = r.workspace_id;

    update public.workspaces set plan = 'free' where id = r.workspace_id;

    -- ⚠️ 크레딧은 깎지 않는다(강등 시 회수 금지 — 이미 받은 이익 회수는 분쟁 소재).
    --    free의 drip이 상한 초과분을 더하지 않으므로 자연히 소진된다(마이그132).

    insert into public.billing_events (workspace_id, kind, payload)
    values (r.workspace_id, 'subscription_expired',
            jsonb_build_object('period_end', r.current_period_end, 'grace_days', p_grace_days));
    v_expired := v_expired + 1;
  end loop;

  return jsonb_build_object('lapsed', v_lapsed, 'expired', v_expired);
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 4. billing_notice_upcoming — 법적 의무② 결제 7일 전 고지
--    계약 제22조 + 여신전문금융업법 시행령. 위반 시 이용자 민원·손배가 가맹점 부담이라
--    "보냈다"는 증빙(billing_events)이 알림 그 자체보다 중요하다.
--    채널은 앱 내 알림으로 시작한다(대표 결정 2026-08-18). B2C로 가면 이메일 구현체를 덧붙인다.
--    ⚠️ 문구에 "충전·크레딧·포인트"를 쓰지 않는다(PG 위험업종 분류 회피).
-- ─────────────────────────────────────────────────────────────
create or replace function public.billing_notice_upcoming(p_days int default 7)
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r       record;
  n       int := 0;
  v_when  timestamptz;
  v_day   text;
begin
  for r in
    select s.workspace_id, s.plan, s.amount_krw, s.billing_cycle, s.auto_renew,
           s.current_period_start, s.current_period_end, s.next_charge_at,
           w.owner_id
      from public.billing_subscriptions s
      join public.workspaces w on w.id = s.workspace_id
     where s.status = 'active'
       and s.cancel_effective_at is null
       -- 청구 예정일(자동갱신) 또는 만료일(수동)이 p_days 안에 있고 아직 지나지 않았을 것
       and coalesce(s.next_charge_at, s.current_period_end) >  now()
       and coalesce(s.next_charge_at, s.current_period_end) <= now() + make_interval(days => p_days)
       -- 같은 기간에 두 번 보내지 않는다(크론이 매일 돌아도 1회만).
       and (s.last_notice_sent_at is null or s.last_notice_sent_at < s.current_period_start)
     for update of s
  loop
    -- 받을 사람이 없으면(owner_id는 on delete set null이라 null일 수 있다) 보낸 것으로 찍지 않는다.
    -- 다음 크론에서 다시 시도된다.
    if r.owner_id is null then
      continue;
    end if;

    v_when := coalesce(r.next_charge_at, r.current_period_end);
    -- 한글은 반드시 큰따옴표로 감싼다 — to_char 포맷에서 따옴표 없는 문자는 패턴으로 해석될 수 있다.
    v_day  := to_char(v_when at time zone 'Asia/Seoul', 'FMMM"월" FMDD"일"');

    insert into public.notifications (user_id, workspace_id, type, title, body, link, metadata)
    values (
      r.owner_id,
      r.workspace_id,
      'billing',
      case when r.auto_renew then '곧 구독료가 결제돼요' else '구독 기간이 곧 끝나요' end,
      case
        when r.auto_renew then
          v_day || '에 ' || to_char(r.amount_krw, 'FM999,999,999') || '원이 결제될 예정이에요. ' ||
          '변경하거나 해지하시려면 결제 화면에서 언제든 하실 수 있어요.'
        else
          v_day || '에 이용 기간이 끝나요. 계속 쓰시려면 결제 화면에서 연장해 주세요.'
      end,
      '/billing',
      jsonb_build_object('plan', r.plan, 'billing_cycle', r.billing_cycle,
                         'amount_krw', r.amount_krw, 'scheduled_at', v_when)
    );

    update public.billing_subscriptions
       set last_notice_sent_at = now(), updated_at = now()
     where workspace_id = r.workspace_id;

    insert into public.billing_events (workspace_id, kind, payload)
    values (r.workspace_id, 'notice_upcoming',
            jsonb_build_object('scheduled_at', v_when, 'amount_krw', r.amount_krw,
                               'plan', r.plan, 'auto_renew', r.auto_renew,
                               'days_ahead', p_days, 'channel', 'in_app'));
    n := n + 1;
  end loop;
  return n;
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 5. 권한 — 전부 service_role 전용(마이그140과 동일 원칙). 앱은 admin client로만 호출한다.
-- ─────────────────────────────────────────────────────────────
revoke execute on function public.billing_apply_payment(text,text,int,timestamptz,jsonb) from public, anon, authenticated;
revoke execute on function public.billing_fail_stale_checkouts(int)                       from public, anon, authenticated;
revoke execute on function public.billing_lapse_due(int)                                  from public, anon, authenticated;
revoke execute on function public.billing_notice_upcoming(int)                            from public, anon, authenticated;
