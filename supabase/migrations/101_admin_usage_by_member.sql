-- 101: 관리자(워크스페이스 오너) 전용 — 구성원별 AI 사용량/토큰/비용 집계.
-- agent_usage RLS는 '본인만'을 그대로 유지(안 건드림). 오너만 집계를 보도록 SECURITY DEFINER RPC로 노출.
-- 대화 '내용'은 반환하지 않음(사용량 메타만). 오너가 아니면 소유 워크스페이스가 없어 빈 결과.
create or replace function public.admin_usage_by_member()
returns table (
  user_id uuid,
  name text,
  calls bigint,
  tokens_input bigint,
  tokens_output bigint,
  cost_usd numeric,
  month_cost_usd numeric
)
language sql
security definer
set search_path = ''
as $$
  select
    u.user_id,
    p.name,
    count(*)::bigint,
    coalesce(sum(u.tokens_input), 0)::bigint,
    coalesce(sum(u.tokens_output), 0)::bigint,
    coalesce(sum(u.cost_usd), 0)::numeric,
    coalesce(sum(u.cost_usd) filter (where u.created_at >= date_trunc('month', now())), 0)::numeric
  from public.agent_usage u
  join public.profiles p on p.id = u.user_id
  where u.workspace_id in (select w.id from public.workspaces w where w.owner_id = (select auth.uid()))
  group by u.user_id, p.name
  order by coalesce(sum(u.cost_usd), 0) desc;
$$;

revoke all on function public.admin_usage_by_member() from public, anon;
grant execute on function public.admin_usage_by_member() to authenticated;
