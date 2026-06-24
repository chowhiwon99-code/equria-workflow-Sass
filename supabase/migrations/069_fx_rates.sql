-- 069: 환율 테이블 — 통화별 '원화 환산율'(일별). 재무 요약의 '원화 환산 합계'용.
-- 전역 참조 데이터(테넌트 무관 — 환율은 회사 공통). 통화별 분리는 그대로 두고, 환산 합계만 별도 표시.
-- 읽기 = 로그인 사용자 누구나. 쓰기 = service_role(서버 라우트 /api/finance/fx-rates)만(쓰기 정책 없음 → RLS가 anon/authed 쓰기 차단).
-- 갱신: 라우트가 하루 1회 외부 환율(Frankfurter/ECB)을 받아 upsert. 멱등(unique).

create table if not exists public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  currency text not null,                 -- USD, EUR, JPY, CNY ...
  krw_per_unit numeric(18,6) not null,    -- 1 단위 = ? 원 (환산: 금액 × krw_per_unit)
  as_of date not null,                    -- 환율 기준일(ECB 발표일)
  source text not null default 'frankfurter',
  fetched_at timestamptz not null default now(),
  unique (currency, as_of)
);

create index if not exists idx_fx_rates_asof on public.fx_rates (as_of desc, currency);

alter table public.fx_rates enable row level security;

drop policy if exists fx_select on public.fx_rates;
create policy fx_select on public.fx_rates for select using (auth.uid() is not null);
-- 쓰기(insert/update/delete) 정책 없음 → service_role 전용.
