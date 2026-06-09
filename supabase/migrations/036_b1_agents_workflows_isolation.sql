-- 036: B1-a 읽기 격리 — agents · workflows · agent_versions.
--
-- 핵심: is_public("공개") 에이전트/워크플로우가 현재 워크스페이스 경계를 무시하고
--       전 테넌트에 노출됨(레드팀 #8) → is_public을 "내 워크스페이스 안 공개"로 한정.
-- 031(workflows)·032(agents) 소프트삭제 fix(소유자는 자기 비활성도 조회)는 그대로 보존하고
--       workspace_id 격리만 AND로 더한다.
-- 멱등: drop policy if exists. 헬퍼: 033.

-- ── agents (032 fix 보존: 소유자는 활성/비활성 무관 조회) ──
drop policy if exists "agents_select" on public.agents;
create policy "agents_select" on public.agents for select using (
  ((select auth.uid()) = created_by or (is_active and is_public))
  and workspace_id in (select public.auth_user_workspace_ids())
);
drop policy if exists "agents_insert" on public.agents;
create policy "agents_insert" on public.agents for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "agents_update" on public.agents;
create policy "agents_update" on public.agents for update
  using ((select auth.uid()) = created_by and workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "agents_delete" on public.agents;
create policy "agents_delete" on public.agents for delete
  using ((select auth.uid()) = created_by and workspace_id in (select public.auth_user_workspace_ids()));

-- ── workflows (031 fix 보존) ──
drop policy if exists "wf_select" on public.workflows;
create policy "wf_select" on public.workflows for select using (
  ((select auth.uid()) = created_by or (is_active and is_public))
  and workspace_id in (select public.auth_user_workspace_ids())
);
drop policy if exists "wf_insert" on public.workflows;
create policy "wf_insert" on public.workflows for insert
  with check ((select auth.uid()) = created_by and public.is_workspace_member(workspace_id));
drop policy if exists "wf_update" on public.workflows;
create policy "wf_update" on public.workflows for update
  using ((select auth.uid()) = created_by and workspace_id in (select public.auth_user_workspace_ids()))
  with check ((select auth.uid()) = created_by and public.is_workspace_member(workspace_id));

-- ── agent_versions (부모 agent EXISTS + 부모 workspace 이중검증, 레드팀 #4) ──
drop policy if exists "av_select" on public.agent_versions;
create policy "av_select" on public.agent_versions for select using (
  exists (
    select 1 from public.agents a
    where a.id = agent_versions.agent_id
      and a.workspace_id in (select public.auth_user_workspace_ids())
      and a.is_active and (a.is_public or a.created_by = (select auth.uid()))
  )
);
drop policy if exists "av_insert" on public.agent_versions;
create policy "av_insert" on public.agent_versions for insert with check (
  public.is_workspace_member(workspace_id)
  and exists (
    select 1 from public.agents a
    where a.id = agent_versions.agent_id
      and a.created_by = (select auth.uid())
      and a.workspace_id in (select public.auth_user_workspace_ids())
  )
);
