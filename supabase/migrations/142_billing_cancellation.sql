-- 142_billing_cancellation.sql — 결제 취소(환불) 통보를 실제로 반영한다
--
-- 왜 필요한가 — 지금까지 뚫려 있던 구멍:
--   나이스페이 상점관리자에서 결제를 취소(전액·부분)하면 우리 서버로 통보가 온다. 그런데
--   webhook 라우트는 그걸 받아 **billing_events에 기록만 하고 끝냈다.**
--   결과: **돈은 돌려줬는데 그 회사는 계속 Standard/Pro 요금제를 쓴다.**
--   마이그141까지의 흐름에는 "결제가 성립하는 길"만 있고 "성립한 결제가 사라지는 길"이 없었다.
--
-- 자동 강등을 이제야 넣는 이유(세션47이 일부러 미뤘던 것):
--   환불 금액 계산(`computeFairRefundKrw`, 법적 의무④)과 한 묶음이어야 한다고 판단했기 때문이다.
--   요금제만 내리고 환불액을 모르면 "요금제는 내려갔는데 얼마 돌려줄지는 모름" 상태가 되고,
--   환불액만 알고 요금제가 그대로면 "돈 돌려줬는데 계속 씀"이 된다. 둘 다 회수 분쟁 소재다.
--   2026-08-21에 `src/lib/billing/refund.ts`가 생겨 짝이 맞았다.
--
-- 🔴 설계 결정 (대표 승인 2026-08-21)
--   ① **취소가 잡히면 전액·부분 무관하게 구독을 종료**한다. 부분 취소가 발생하는 유일한 실제
--      시나리오가 "연 구독 중도 해지 일할 환불"이고, 그건 곧 이용 종료를 뜻하기 때문이다.
--      (가맹점이 요청하지 않으면 취소는 발생하지 않는다 — PG가 임의로 소액 취소를 보내지 않는다.)
--   ② **현재 유효한 기간의 결제가 취소된 경우에만** 강등한다(`current_period_start` 일치 검사).
--      갱신이 여러 번 쌓인 뒤 옛 결제를 취소하면 지금 구독까지 끊기는 사고가 나기 때문이다.
--   ③ **AI 사용량(크레딧)은 깎지 않는다.** 마이그140·141과 같은 원칙 — 이미 준 이익 회수는 분쟁 소재다.
--      free의 drip이 상한 초과분을 더하지 않으므로 자연히 소진된다(마이그132).
--
-- 🔴 멱등성 — 통보는 최대 10회 재전송된다(규격 확인). 두 번 처리돼도 결과가 같아야 한다.
--   취소 금액을 **누적 합산하지 않고** `greatest(기존, 새 값)`으로 덮는다. 나이스페이 조회/통보의
--   취소금액이 "누적"인지 "이번 건"인지 문서가 단정하지 않는데, 누적으로 보고 최댓값을 취하면
--   어느 쪽이든 두 번 처리해도 금액이 부풀지 않는다. (합산하면 재통지 한 번에 금액이 2배가 된다.)
--
-- 안전성: 신규 함수 1개(additive). 기존 함수·테이블·데이터 변경 0. 유료 워크스페이스 1개(대표 본인).
--
-- 롤백:
--   drop function if exists public.billing_apply_cancellation(text,text,int,timestamptz,jsonb);

create or replace function public.billing_apply_cancellation(
  p_order_id           text,
  p_tid                text        default null,
  p_canceled_amount_krw int        default null,   -- null = 전액 취소로 본다
  p_canceled_at        timestamptz default null,
  p_raw                jsonb       default '{}'::jsonb
) returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  pay        public.billing_payments;
  v_new      int;
  v_total    int;
  v_status   text;
  v_subs     int := 0;
begin
  -- 직렬화: 재전송된 통보가 동시에 들어와도 한 줄로 세운다(마이그140과 같은 이유).
  select * into pay from public.billing_payments
   where order_id = p_order_id for update;
  if not found then
    return 'unknown';
  end if;

  -- 승인되지 않은 결제는 취소할 것이 없다. ready/failed를 취소로 덮으면 이력이 왜곡된다.
  -- ⚠️ 'canceled'를 **여기서 막으면 안 된다**. 이미 취소된 건에 통보가 재전송됐을 때
  --    'noop'("취소할 게 없었다")으로 기록돼 감사 로그가 거짓이 된다. 아래 재통지 흡수 분기가
  --    'already'로 정확히 잡는다. (금액은 greatest로 올라가기만 하므로 되돌려지지 않는다.)
  if pay.status not in ('paid', 'partial_canceled', 'canceled') then
    return 'noop';
  end if;

  -- 취소 금액. 통보가 금액을 안 주면 전액 취소로 본다(가장 흔한 경우이고, 덜 돌려주는 방향의
  -- 오차보다 낫다 — 우리가 이미 PG에서 취소를 실행한 뒤에 오는 통보다).
  v_new   := coalesce(p_canceled_amount_krw, pay.amount_krw);
  -- 🔴 합산이 아니라 최댓값. 재통지에 금액이 부풀지 않게 하는 유일한 방어다.
  v_total := least(pay.amount_krw, greatest(coalesce(pay.canceled_amount_krw, 0), greatest(v_new, 0)));

  v_status := case when v_total >= pay.amount_krw then 'canceled' else 'partial_canceled' end;

  -- 재통지 흡수: 상태·금액이 이미 같으면 아무것도 바꾸지 않는다.
  if pay.status = v_status and coalesce(pay.canceled_amount_krw, 0) = v_total then
    return 'already';
  end if;

  update public.billing_payments
     set status               = v_status,
         canceled_amount_krw  = v_total,
         canceled_at          = coalesce(p_canceled_at, canceled_at, now()),
         tid                  = coalesce(tid, p_tid),
         raw                  = case when p_raw = '{}'::jsonb then raw else p_raw end
   where id = pay.id;

  -- ② 지금 유효한 기간의 결제가 취소된 경우에만 구독을 끊는다.
  --    (갱신이 쌓인 뒤 옛 결제를 취소해도 현재 구독은 그대로 유지된다.)
  update public.billing_subscriptions
     set status              = 'canceled',
         auto_renew          = false,
         next_charge_at      = null,
         cancel_requested_at = coalesce(cancel_requested_at, now()),
         cancel_effective_at = coalesce(p_canceled_at, now()),
         cancel_reason       = coalesce(cancel_reason, '결제 취소(환불)'),
         updated_at          = now()
   where workspace_id = pay.workspace_id
     and status in ('active', 'past_due')
     and current_period_start = pay.period_start;
  get diagnostics v_subs = row_count;

  if v_subs > 0 then
    -- ③ 크레딧은 깎지 않는다. 요금제만 내린다.
    update public.workspaces set plan = 'free' where id = pay.workspace_id;
  end if;

  insert into public.billing_events (workspace_id, kind, payload)
  values (pay.workspace_id, 'refund_issued',
          jsonb_build_object('order_id', p_order_id,
                             'tid', coalesce(p_tid, pay.tid),
                             'canceled_amount_krw', v_total,
                             'paid_amount_krw', pay.amount_krw,
                             'result', v_status,
                             'subscription_closed', v_subs > 0));

  return v_status;
end $function$;

-- 권한 — service_role 전용(마이그140·141과 동일 원칙). 앱은 admin client로만 호출한다.
revoke execute on function public.billing_apply_cancellation(text,text,int,timestamptz,jsonb) from public, anon, authenticated;
