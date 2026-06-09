-- 042: 비용 추적(H1) — agent_usage 에 모델·비용 컬럼 추가.
-- Claude 호출마다 토큰만 기록하던 것을 모델·달러비용까지 기록(추적·예산의 토대).
-- 순수 additive(nullable) → 기존 행/코드 영향 0. 되돌리기 = drop column.
alter table public.agent_usage
  add column if not exists model text,
  add column if not exists cost_usd numeric(12,6);

comment on column public.agent_usage.cost_usd is 'Claude 호출 추정 비용(USD). lib/pricing.ts 단가표 기준 — 정확 청구는 Anthropic 콘솔.';
