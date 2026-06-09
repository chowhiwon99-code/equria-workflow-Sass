-- 039: B1-a 읽기 격리 — MCP(회사별 격리, 대표 결정). mcp_servers · mcp_tools.
-- 이전: select='auth.uid() is not null'(전사 노출), admin ALL='profiles.role=admin'(전역 관리).
-- 신규: 조회=내 워크스페이스만, 관리(ALL)=관리자 AND 내 워크스페이스(타 회사 MCP 관리 차단).
-- (워크스페이스별 admin 개념은 B2 RBAC에서 정교화. B1은 전역 admin role + workspace 멤버십으로 격리.)
-- 멱등.

-- ── mcp_servers ──
drop policy if exists "mcp_select" on public.mcp_servers;
create policy "mcp_select" on public.mcp_servers for select
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "mcp_admin" on public.mcp_servers;
create policy "mcp_admin" on public.mcp_servers for all
  using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
    and workspace_id in (select public.auth_user_workspace_ids())
  )
  with check (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
    and public.is_workspace_member(workspace_id)
  );

-- ── mcp_tools ──
drop policy if exists "mcptools_select" on public.mcp_tools;
create policy "mcptools_select" on public.mcp_tools for select
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "mcptools_admin" on public.mcp_tools;
create policy "mcptools_admin" on public.mcp_tools for all
  using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
    and workspace_id in (select public.auth_user_workspace_ids())
  )
  with check (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
    and public.is_workspace_member(workspace_id)
  );
