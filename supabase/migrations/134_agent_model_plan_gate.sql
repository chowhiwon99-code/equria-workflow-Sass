-- 134_agent_model_plan_gate.sql — 고급 모델(Opus 등)을 Pro 이상 플랜 전용으로 강제
--
-- 왜 트리거인가: 에이전트 버전은 API 라우트가 아니라 **클라이언트에서 Supabase로 직접**
-- insert된다(AgentBuilderForm.tsx). 서버 라우트가 없으므로 앱에서 막으면 우회 가능하고,
-- 앞으로 다른 저장 경로가 생기면 조용히 뚫린다. 모든 경로가 공통으로 거치는 유일한 지점이
-- agent_versions INSERT 이므로 여기 한 곳에 건다. (마이그133 크레딧 차감과 같은 이유)
--
-- 왜 모델 id 목록이 아니라 티어 매칭인가: 'claude-opus-4-7' 같은 개별 id를 나열하면
-- 새 Opus/Fable 모델이 나왔을 때 목록에 없어서 무료 플랜에 열린다(fail-open).
-- 이름으로 티어를 잡아 **모르는 고가 모델은 막히는 쪽(fail-closed)**으로 둔다.
-- 단가 기준(2026-08): Opus $5/$25 · Fable/Mythos $10/$50 vs Sonnet $3/$15 · Haiku $1/$5.
--
-- grandfather: 이미 그 모델을 쓰던 에이전트는 계속 편집/저장할 수 있다.
-- 기존 데이터를 깨지 않는다(추가 우선 원칙) — 무료 플랜의 기존 Opus 에이전트 1건 유지.
--
-- 앱 쪽 SSOT: src/lib/plans.ts 의 PREMIUM_MODEL_MIN_PLAN / isPremiumModel 과 반드시 일치시킬 것.
--
-- 롤백:
--   drop trigger if exists agent_versions_model_plan_gate on public.agent_versions;
--   drop function if exists public.agent_version_enforce_model_plan();

create or replace function public.agent_version_enforce_model_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_model text := lower(coalesce(new.model, ''));
begin
  -- 고가 티어가 아니면 통과 (sonnet · haiku 등)
  if v_model not like '%opus%'
     and v_model not like '%fable%'
     and v_model not like '%mythos%'
  then
    return new;
  end if;

  -- grandfather: 이 에이전트가 이미 같은 모델로 저장된 적 있으면 통과(편집 차단 방지)
  if exists (
    select 1 from public.agent_versions av
    where av.agent_id = new.agent_id
      and lower(av.model) = v_model
      and av.id is distinct from new.id
  ) then
    return new;
  end if;

  select w.plan into v_plan
  from public.workspaces w
  where w.id = new.workspace_id;

  if coalesce(v_plan, 'free') in ('pro', 'premium') then
    return new;
  end if;

  raise exception '고급 AI 모델(Opus)은 Pro 이상 요금제에서 사용할 수 있어요. 요금제를 올리거나 Sonnet을 선택해 주세요.'
    using errcode = 'check_violation';
end;
$$;

-- 트리거 전용 함수 → REST /rpc 로 직접 호출될 수 없게 막는다(safe-changes §5).
-- ⚠️ PUBLIC 기본 grant 때문에 anon/authenticated만 revoke하면 실제로는 안 걷힌다. public까지 revoke할 것.
-- 트리거 실행에는 호출자의 EXECUTE 권한이 필요 없어서(PostgreSQL 규칙) 게이트는 그대로 동작한다 — 아래 시뮬로 확인함.
revoke execute on function public.agent_version_enforce_model_plan() from public, anon, authenticated;

drop trigger if exists agent_versions_model_plan_gate on public.agent_versions;
create trigger agent_versions_model_plan_gate
  before insert on public.agent_versions
  for each row execute function public.agent_version_enforce_model_plan();
