-- 014_agent_builder.sql
-- Phase 3a: 커스텀 에이전트 빌더 + 위젯 핀.
-- 직원이 자기 에이전트를 만들고(기본 비공개+공유토글), 위젯에 띄울 것을 직접 고른다.

-- ① agents_select: 비공개 에이전트는 소유자에게만 (현재는 is_public 무시 → 비공개가 모두에게 보임)
drop policy if exists agents_select on public.agents;
create policy agents_select on public.agents for select
  using (
    auth.uid() is not null
    and is_active
    and (is_public or created_by = auth.uid())
  );

-- ② av_select: 버전(시스템 프롬프트)은 해당 agent가 나에게 보일 때만 (타인 비공개 에이전트로 대화 차단)
drop policy if exists av_select on public.agent_versions;
create policy av_select on public.agent_versions for select
  using (
    exists (
      select 1 from public.agents a
      where a.id = agent_versions.agent_id
        and a.is_active
        and (a.is_public or a.created_by = auth.uid())
    )
  );

-- ③ av_insert: 버전 추가는 본인 소유 에이전트에만 (현재 authenticated 전체 → 타인 에이전트 하이재킹 가능)
drop policy if exists av_insert on public.agent_versions;
create policy av_insert on public.agent_versions for insert
  with check (
    exists (
      select 1 from public.agents a
      where a.id = agent_versions.agent_id
        and a.created_by = auth.uid()
    )
  );

-- ④ 위젯 핀: 사용자가 위젯에 띄울 에이전트 선택
create table if not exists public.user_agent_pins (
  user_id uuid not null references public.profiles(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, agent_id)
);
alter table public.user_agent_pins enable row level security;

drop policy if exists uap_select on public.user_agent_pins;
create policy uap_select on public.user_agent_pins for select using (user_id = auth.uid());
drop policy if exists uap_insert on public.user_agent_pins;
create policy uap_insert on public.user_agent_pins for insert with check (user_id = auth.uid());
drop policy if exists uap_delete on public.user_agent_pins;
create policy uap_delete on public.user_agent_pins for delete using (user_id = auth.uid());
