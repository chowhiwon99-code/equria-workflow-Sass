-- 087: 워크스페이스 월 AI 비용 예산(USD). null = 무제한.
-- 초과 시 비관리자의 AI 실행(에이전트/워크플로우/어시스턴트 등)을 차단(hard limit). 관리자는 예외.
alter table public.workspaces
  add column if not exists monthly_budget_usd numeric(12, 2);

comment on column public.workspaces.monthly_budget_usd is
  '월 AI 비용 예산(USD). null=무제한. 초과 시 비관리자 AI 실행 차단(agent_usage.cost_usd 월 합계 기준).';
