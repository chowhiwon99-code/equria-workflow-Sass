-- 138: 포함 크레딧 재설계 — 원가율 40% 목표 역산 (대표 결정 2026-08-14)
--
-- 왜: 기존 포함량(Standard 3,000 / Pro 7,000)은 매출보다 원가 허용치가 컸다.
--   Standard 3,000크레딧 = 원가 $30 vs 월 매출 $19.16 → 포함량 원가율 156%
--   Pro     7,000크레딧 = 원가 $70 vs 월 매출 $32.37 → 포함량 원가율 216%
--   여기에 앱의 공정사용 3배까지 겹치면 Standard 최악 $90(원가율 470%)이었다.
--   결제(나이스페이) 연동 전에 고치지 않으면 "적자를 자동으로 청구"하게 된다.
--
-- 산정: 포함 크레딧 = 월 매출(USD) × 0.40 ÷ $0.01   (1 크레딧 = $0.01 원가, 환율 ₩1,514/$)
--   Standard ₩29,000 = $19.16 → 40% = $7.66 → 766 → 채택 750  (원가율 39.2%)
--   Pro      ₩49,000 = $32.37 → 40% = $12.95 → 1,295 → 채택 1,300 (원가율 40.2%)
--   free는 매출 0이라 역산 불가 → 500(월 $5) 유지. 최악값은 앱의 공정사용 배수를
--   1.0으로 내려 $15 → $5로 묶었다(src/lib/plans.ts).
--
-- 안전성:
--   · 유료 워크스페이스가 **현재 0개**다(free 1 · premium 2, 2026-08-14 확인) → 실사용 영향 없음.
--     유료 고객이 생긴 뒤에는 포함량 축소가 계약 변경이 되므로 지금이 바꿀 수 있는 시점이다.
--   · 이미 부여된 잔액은 즉시 깎이지 않는다. credit_sync는 유료 플랜을 **월 경계에서만**
--     v_cap으로 재설정하므로, 기존 잔액은 다음 달 갱신 때 새 상한을 따른다.
--   · free는 drip이 least(경과일×17, max(cap-bal,0))라 잔액이 상한을 넘어도 음수를 더하지 않는다.
--   · IMMUTABLE 순수 함수 교체이므로 데이터 변경이 없다 → 롤백 = 아래 값 되돌리기.
--
-- ⚠️ src/lib/plans.ts PLANS.includedCredits와 **반드시 같은 값**이어야 한다.
--    차감·충전은 이 함수가, 화면 안내는 plans.ts가 하므로 어긋나면
--    "안내는 여유인데 실제로 막히는" 상태가 된다.
--
-- 롤백:
--   create or replace function public.plan_monthly_credits(p_plan text) ... 를
--   free 500 / standard 3000 / pro 7000 / premium null 로 되돌리고
--   src/lib/plans.ts의 includedCredits·fairUseMultiplier(3)도 함께 되돌린다.

create or replace function public.plan_monthly_credits(p_plan text)
returns numeric
language sql
immutable
set search_path to 'public'
as $function$
  select case coalesce(p_plan, 'free')
    when 'free' then 500      -- 매출 0 → 전환 미끼 예산(월 $5). 하루 17씩 회복(free_daily_drip).
    when 'standard' then 750  -- ₩29,000 × 40% 원가율 역산(766 → 750)
    when 'pro' then 1300      -- ₩49,000 × 40% 원가율 역산(1,295 → 1,300)
    when 'premium' then null  -- 무제한(협의) — null이면 credit_sync가 게이팅을 걸지 않는다
    else 500
  end::numeric;
$function$;
