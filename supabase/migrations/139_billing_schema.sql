-- 139_billing_schema.sql — 결제(구독) 스키마: 테이블·RLS·좌석 한도 확장
--
-- 왜: 2026-08-18 나이스페이 계약 서명 완료. 임시오픈 30일(→2026-09-17) 안에 결제를 붙여야
--   실테스트가 가능하다. 현재 결제 코드 0줄, 관련 테이블 0개.
--   RPC(정산·해지·동의·환불)는 **마이그140**에 분리했다 — 스키마와 로직을 나눠야 롤백이 독립적이다.
--
-- 이름 규칙: 전부 `billing_` 접두사. 이 DB엔 이미 finance_entries·cash_*·expense_reports가 있어
--   "우리가 받는 돈"과 "고객사가 쓰는 돈"이 이름으로 구분되지 않는다. `grep billing_` 하나로
--   결제 코드 전부가 나오게 한다.
--
-- 설계 근거(중요한 것만):
--   ① billing_keys를 **별도 테이블 + RLS 정책 0개**로 둔다.
--      billing_subscriptions는 플랜 표시를 위해 멤버 SELECT를 열어야 하는데, 같은 행에 빌링키(bid)가
--      있으면 브라우저로 빌링키가 나간다. PostgREST의 컬럼 단위 차단은 불안정하므로 테이블을 쪼개고
--      정책을 하나도 만들지 않아 전면 거부한다(service_role만 도달).
--   ② 동의/고지 이력을 각각 테이블로 쪼개지 않고 billing_events 하나로 합쳤다.
--      필드 3~4개짜리 append-only 로그를 둘로 나누면 RLS·인덱스·RPC가 두 배가 되는데,
--      실제 분쟁에서는 항상 "시간순 전체"를 뽑는다.
--   ③ 좌석 가산은 workspace_seat_limit()를 **신설**하고 plan_seat_limit(text)는 건드리지 않는다.
--      후자는 src/lib/plans.ts의 seats와 1:1 대응하는 SSOT 짝이라, 여기에 좌석을 더하면
--      "랜딩 = plans.ts = DB" 3중 대조가 깨진다(2026-08-15 사고와 같은 유형).
--   ④ 쓰기 정책은 어디에도 만들지 않는다. 전부 security definer RPC 경유(credit_ledger 관례).
--      delete 정책도 만들지 않는다(워크스페이스 삭제는 FK cascade에 위임).
--
-- 금액 정의: amount_krw는 **부가세 포함 총액**(정수 원). plans.ts priceKrw·랜딩 가격표·환불 계산이
--   전부 같은 정의여야 한다. 다르면 일할 환불에서 10%가 어긋난다.
--   ⚠️ 랜딩·plans.ts에 VAT 포함 여부 표기가 아직 없다 — 대표 확정 후 명시할 것.
--
-- 안전성: 전부 신규 테이블·신규 함수(additive). 기존 데이터 변경 0.
--   유료 워크스페이스 0개(free 1·premium 2, 2026-08-18 확인)라 실사용 영향도 0.
--   accept_workspace_invite만 교체되는데, workspace_seat_limit()가 paid_seats 없을 때
--   plan_seat_limit()와 정확히 같은 값을 돌려주므로 **동작 불변**이다.
--
-- 롤백:
--   drop function if exists public.workspace_seat_limit(uuid);
--   -- accept_workspace_invite를 마이그125 원문으로 되돌린다(plan_seat_limit 호출로 환원)
--   alter table public.notifications drop constraint if exists notifications_type_check;
--   alter table public.notifications add constraint notifications_type_check
--     check (type in ('dm','event_done','event_invite','project_assigned','mail','system',
--                     'announcement','approval','group','workflow'));
--   drop table if exists public.billing_events;
--   drop table if exists public.billing_keys;
--   drop table if exists public.billing_payments;
--   drop table if exists public.billing_subscriptions;

-- ─────────────────────────────────────────────────────────────
-- 1. billing_subscriptions — 워크스페이스당 1행
-- ─────────────────────────────────────────────────────────────
create table if not exists public.billing_subscriptions (
  workspace_id            uuid primary key references public.workspaces(id) on delete cascade,
  plan                    text not null check (plan in ('standard','pro')),
  status                  text not null check (status in ('pending','active','past_due','canceled','expired')),
  billing_cycle           text not null default 'monthly' check (billing_cycle in ('monthly','yearly')),
  paid_seats              int  not null default 0 check (paid_seats >= 0),
  amount_krw              int  not null check (amount_krw >= 0),
  current_period_start    timestamptz not null,
  current_period_end      timestamptz not null,
  -- 빌링키 승인 전에는 항상 false. 승인 후 renew.ts가 켠다.
  auto_renew              boolean not null default false,
  next_charge_at          timestamptz,           -- null = 자동갱신 없음
  retry_count             int  not null default 0 check (retry_count >= 0),
  -- 법적 의무① 자동결제 별도 동의(상세 이력은 billing_events, 여기는 hot path 조회용)
  consent_auto_billing_at timestamptz,
  consent_terms_version   text,
  -- 법적 의무② 7일 전 고지 중복 발송 방지
  last_notice_sent_at     timestamptz,
  -- 법적 의무③ 24시간 해지: 접수 시각이 증빙이다. 즉시 종료가 아니라 기간 만료 방식
  -- (/refund 제2조 1항 "해지 시 다음 결제일부터 중단, 이미 결제된 기간은 만료일까지 이용").
  cancel_requested_at     timestamptz,
  cancel_effective_at     timestamptz,
  cancel_reason           text,
  card_brand              text,                  -- 표시용 마스킹 정보만
  card_last4              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint billing_sub_period_order check (current_period_end > current_period_start)
);

comment on table public.billing_subscriptions is
  '워크스페이스 구독 상태. premium(자사 내부 무제한)은 행을 만들지 않는다 — 돈을 안 받는 플랜이 갱신 크론에 잡히면 안 된다.';
comment on column public.billing_subscriptions.paid_seats is
  '결제된 좌석 수. 실제 비게스트 인원이 아니다 — 다운그레이드 시 미결제 좌석에 혜택이 붙는 것을 막는다.';
comment on column public.billing_subscriptions.amount_krw is
  '부가세 포함 총액(원). src/lib/plans.ts의 quoteAmountKrw()만이 이 값을 만든다.';

create index if not exists billing_subscriptions_next_charge_idx
  on public.billing_subscriptions (next_charge_at)
  where next_charge_at is not null;
create index if not exists billing_subscriptions_cancel_due_idx
  on public.billing_subscriptions (cancel_effective_at)
  where cancel_effective_at is not null;

-- ─────────────────────────────────────────────────────────────
-- 2. billing_payments — append-only 결제 시도·결과
-- ─────────────────────────────────────────────────────────────
create table if not exists public.billing_payments (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  -- 멱등 앵커. checkout 시점에 서버가 먼저 만들어 넣는다.
  order_id            text not null unique,
  -- 나이스페이 거래번호. 승인 후에만 채워진다. unique가 "다른 주문에 같은 승인"도 막는다.
  tid                 text unique,
  status              text not null check (status in ('ready','paid','failed','canceled','partial_canceled')),
  -- ★위변조 방어의 핵심: checkout 시점에 서버가 못박은 금액. 승인응답·웹훅·조회 API를 전부 이 값과 대조한다.
  amount_krw          int  not null check (amount_krw >= 0),
  canceled_amount_krw int  not null default 0 check (canceled_amount_krw >= 0),
  plan                text not null,
  billing_cycle       text not null,
  seats               int  not null default 0,   -- 결제 시점 스냅샷(요금제가 바뀌어도 증빙 불변)
  period_start        timestamptz,
  period_end          timestamptz,
  pay_source          text not null default 'checkout'
                        check (pay_source in ('checkout','billing_key','manual')),
  method              text,                      -- 'card' | 'vbank' | 'bank' ...
  approved_at         timestamptz,
  canceled_at         timestamptz,
  refund_reason       text,
  receipt_url         text,
  raw                 jsonb not null default '{}'::jsonb,  -- PG 원문 = 분쟁 시 유일한 증거
  created_at          timestamptz not null default now(),
  constraint billing_pay_cancel_le_amount check (canceled_amount_krw <= amount_krw)
);

comment on column public.billing_payments.amount_krw is
  '서버가 checkout 시점에 확정한 부가세 포함 총액. 클라이언트가 보낸 금액은 어느 경로로도 이 컬럼에 닿으면 안 된다.';

create index if not exists billing_payments_ws_created_idx
  on public.billing_payments (workspace_id, created_at desc);
-- 대사(reconcile) 크론이 미확정 결제를 훑는 경로
create index if not exists billing_payments_ready_idx
  on public.billing_payments (created_at)
  where status = 'ready';

-- ─────────────────────────────────────────────────────────────
-- 3. billing_keys — 빌링키. RLS 정책을 하나도 만들지 않는다(전면 거부).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.billing_keys (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider     text not null default 'nicepay',
  bid          text not null,                    -- 나이스페이 빌링키
  card_brand   text,
  card_last4   text,
  status       text not null default 'active' check (status in ('active','revoked')),
  issued_at    timestamptz not null default now(),
  revoked_at   timestamptz
);

comment on table public.billing_keys is
  '빌링키. RLS를 켜고 정책을 하나도 만들지 않아 service_role 외에는 접근 불가. billing_subscriptions에 컬럼으로 두면 멤버 SELECT를 통해 브라우저로 새기 때문에 테이블을 분리했다.';

create unique index if not exists billing_keys_active_uq
  on public.billing_keys (workspace_id) where status = 'active';
create index if not exists billing_keys_ws_issued_idx
  on public.billing_keys (workspace_id, issued_at desc);

-- ─────────────────────────────────────────────────────────────
-- 4. billing_events — append-only 감사 로그(법적 의무 ①②③의 증거)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.billing_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind         text not null check (kind in (
                 'consent_auto_billing','consent_withdrawn',
                 'notice_upcoming','notice_price_change',
                 'cancel_requested','cancel_revoked','cancel_effected',
                 'refund_issued','webhook_received','reconciled','renew_failed')),
  actor_id     uuid references public.profiles(id) on delete set null,
  payload      jsonb not null default '{}'::jsonb,   -- ip·ua·terms_version·scheduled_at·amount·tid
  created_at   timestamptz not null default now()
);

comment on table public.billing_events is
  '결제 관련 감사 로그. 자동결제 동의(시각·약관버전·IP·UA)와 고지·해지 이력이 여기 쌓인다. 계약 제22조 위반 시 민원·손배가 전부 가맹점 부담이라 이 로그가 유일한 방어다.';

create index if not exists billing_events_ws_created_idx
  on public.billing_events (workspace_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 5. RLS — select만 개방. 쓰기는 전부 마이그140의 security definer RPC.
-- ─────────────────────────────────────────────────────────────
alter table public.billing_subscriptions enable row level security;
alter table public.billing_payments      enable row level security;
alter table public.billing_keys          enable row level security;
alter table public.billing_events        enable row level security;

-- 구독 상태는 플랜·좌석 UI 게이팅에 필요하므로 멤버까지 열어준다(빌링키는 여기 없다).
drop policy if exists billing_subscriptions_select on public.billing_subscriptions;
create policy billing_subscriptions_select on public.billing_subscriptions for select
  using (workspace_id in (select public.auth_user_workspace_ids()));

-- 결제 내역·감사 로그는 금액과 개인정보가 섞이므로 오너만.
drop policy if exists billing_payments_select on public.billing_payments;
create policy billing_payments_select on public.billing_payments for select
  using (public.auth_is_workspace_owner(workspace_id));

drop policy if exists billing_events_select on public.billing_events;
create policy billing_events_select on public.billing_events for select
  using (public.auth_is_workspace_owner(workspace_id));

-- billing_keys: 정책 없음 = 전면 거부. 의도적이며 삭제하지 말 것.

-- ─────────────────────────────────────────────────────────────
-- 6. notifications.type 화이트리스트에 'billing' 추가 (마이그104가 선례)
--    ⚠️ 기존 값 10개를 하나도 빠뜨리면 안 된다(2026-08-18 실물 확인).
-- ─────────────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('dm','event_done','event_invite','project_assigned','mail','system',
                  'announcement','approval','group','workflow','billing'));

-- ─────────────────────────────────────────────────────────────
-- 7. workspace_seat_limit — 플랜 기본 좌석 + 결제한 추가 좌석
--    plan_seat_limit(text)는 그대로 둔다(plans.ts SSOT 짝).
-- ─────────────────────────────────────────────────────────────
create or replace function public.workspace_seat_limit(p_workspace_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
           when public.plan_seat_limit(w.plan) is null then null   -- premium = 무제한
           else public.plan_seat_limit(w.plan)
                + coalesce((select s.paid_seats
                              from public.billing_subscriptions s
                             where s.workspace_id = w.id
                               and s.status in ('active','past_due')), 0)
         end
  from public.workspaces w
  where w.id = p_workspace_id;
$function$;

comment on function public.workspace_seat_limit(uuid) is
  '실제 좌석 한도 = 요금제 기본 좌석 + 결제된 추가 좌석. paid_seats가 0이거나 구독이 없으면 plan_seat_limit()와 동일하므로 기존 동작이 보존된다.';

-- authenticated에도 주지 않는다: 임의 uuid로 남의 워크스페이스 좌석 한도를 조회할 수 있기 때문.
-- accept_workspace_invite는 security definer라 소유자 권한으로 실행되므로 내부 호출은 그대로 된다.
-- UI의 "좌석 N/M" 표시는 기존대로 plans.ts + billing_subscriptions.paid_seats(멤버 select 허용)로 계산한다.
revoke execute on function public.workspace_seat_limit(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8. accept_workspace_invite — 좌석 판정만 workspace_seat_limit로 교체
--    (마이그125 원문에서 이 두 줄 외에는 변경 없음)
-- ─────────────────────────────────────────────────────────────
create or replace function public.accept_workspace_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  inv public.workspace_invites;
  uid uuid := (select auth.uid());
  seat_limit int;
  seats_used int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.workspace_invites where token = p_token for update;
  if not found then raise exception 'invite invalid or expired'; end if;
  if inv.revoked_at is not null or inv.expires_at <= now()
     or (inv.max_uses is not null and inv.use_count >= inv.max_uses) then
    raise exception 'invite invalid or expired';
  end if;

  if inv.role <> 'guest'
     and not exists (select 1 from public.workspace_members m where m.workspace_id = inv.workspace_id and m.user_id = uid) then
    -- 변경점: plan_seat_limit(w.plan) → workspace_seat_limit(ws) (결제한 추가 좌석 반영)
    seat_limit := public.workspace_seat_limit(inv.workspace_id);
    if seat_limit is not null then
      select count(*) into seats_used from public.workspace_members m
        where m.workspace_id = inv.workspace_id and coalesce(m.role, 'member') <> 'guest';
      if seats_used >= seat_limit then
        raise exception 'seat limit reached' using errcode = 'P0001';
      end if;
    end if;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, uid, case when inv.role = 'owner' then 'owner' else inv.role end)
  on conflict (workspace_id, user_id) do nothing;

  if inv.role = 'owner' then
    update public.workspaces set owner_id = uid where id = inv.workspace_id and owner_id is null;
  end if;

  if inv.role = 'guest' then
    insert into public.project_members (project_id, user_id, workspace_id)
    select pid, uid, inv.workspace_id
    from unnest(inv.project_ids) pid
    where exists (select 1 from public.projects p where p.id = pid and p.workspace_id = inv.workspace_id)
    on conflict (project_id, user_id) do nothing;
  end if;

  update public.workspace_invites set use_count = use_count + 1 where id = inv.id;
  return (select jsonb_build_object('workspace_id', w.id, 'slug', w.slug, 'name', w.name)
          from public.workspaces w where w.id = inv.workspace_id);
end $function$;
