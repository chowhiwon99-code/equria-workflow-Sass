-- 133_credit_consume_trigger.sql — agent_usage 기록 시 크레딧 자동 차감
--
-- 왜 트리거인가: AI 라우트가 9곳(chat·assistant·workflows/run·interview·memory 2종·task-suggestions·
-- generate-prompt·cashflow-coach 등)인데 각각 차감 코드를 넣으면 (1) 하나는 반드시 빠지고
-- (2) 앞으로 추가되는 라우트가 조용히 무료가 된다. 모든 라우트가 공통으로 거치는 유일한 지점이
-- agent_usage INSERT 이므로 여기 한 곳에 걸어 누락을 구조적으로 불가능하게 만든다.
--
-- 1 크레딧 = $0.01 → cost_usd * 100 = 차감 크레딧.
-- 실패 호출(success=false)은 차감하지 않는다.
--
-- 롤백:
--   drop trigger if exists agent_usage_consume_credits on public.agent_usage;
--   drop function if exists public.credit_consume_from_usage();

create or replace function public.credit_consume_from_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.success
     and new.workspace_id is not null
     and new.cost_usd is not null
     and new.cost_usd > 0
  then
    -- 차감 실패가 사용량 기록 자체를 막으면 안 된다(관측성 우선) → 예외는 삼킨다.
    begin
      perform public.credit_consume(
        new.workspace_id,
        round(new.cost_usd::numeric * 100, 2),
        coalesce(new.model, 'ai')
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists agent_usage_consume_credits on public.agent_usage;
create trigger agent_usage_consume_credits
  after insert on public.agent_usage
  for each row execute function public.credit_consume_from_usage();
