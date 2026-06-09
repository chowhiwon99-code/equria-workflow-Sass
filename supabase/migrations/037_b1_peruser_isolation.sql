-- 037: B1-a 읽기 격리 — 사용자별 개인 데이터(이미 user_id 스코프, workspace AND로 다중소속·심층방어).
-- 대상: conversations · messages · assistant_conversations · assistant_messages
--       · workflow_runs · agent_usage · user_agent_pins · notifications
-- 기존 user_id/부모 조건 보존 + workspace_id 격리 추가. 멱등.

-- ── conversations (에이전트 대화, ALL=user_id) ──
drop policy if exists "conv_select" on public.conversations;
create policy "conv_select" on public.conversations for select
  using ((select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "conv_insert" on public.conversations;
create policy "conv_insert" on public.conversations for insert
  with check ((select auth.uid()) = user_id and public.is_workspace_member(workspace_id));
drop policy if exists "conv_update" on public.conversations;
create policy "conv_update" on public.conversations for update
  using ((select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "conv_delete" on public.conversations;
create policy "conv_delete" on public.conversations for delete
  using ((select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids()));

-- ── messages (부모 conversation 통한 격리) ──
drop policy if exists "msg_select" on public.messages;
create policy "msg_select" on public.messages for select using (
  exists (select 1 from public.conversations c
          where c.id = messages.conversation_id and c.user_id = (select auth.uid())
            and c.workspace_id in (select public.auth_user_workspace_ids()))
);
drop policy if exists "msg_insert" on public.messages;
create policy "msg_insert" on public.messages for insert with check (
  exists (select 1 from public.conversations c
          where c.id = messages.conversation_id and c.user_id = (select auth.uid())
            and c.workspace_id in (select public.auth_user_workspace_ids()))
);

-- ── assistant_conversations (ALL=user_id) ──
drop policy if exists "ac_all" on public.assistant_conversations;
create policy "ac_all" on public.assistant_conversations for all
  using ((select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids()))
  with check ((select auth.uid()) = user_id and public.is_workspace_member(workspace_id));

-- ── assistant_messages (부모 assistant_conversation 통한 격리) ──
drop policy if exists "am_all" on public.assistant_messages;
create policy "am_all" on public.assistant_messages for all
  using (exists (select 1 from public.assistant_conversations c
                 where c.id = assistant_messages.conversation_id and c.user_id = (select auth.uid())
                   and c.workspace_id in (select public.auth_user_workspace_ids())))
  with check (exists (select 1 from public.assistant_conversations c
                 where c.id = assistant_messages.conversation_id and c.user_id = (select auth.uid())
                   and c.workspace_id in (select public.auth_user_workspace_ids())));

-- ── workflow_runs (select/update=user_id) ──
drop policy if exists "wfrun_select" on public.workflow_runs;
create policy "wfrun_select" on public.workflow_runs for select
  using ((select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "wfrun_insert" on public.workflow_runs;
create policy "wfrun_insert" on public.workflow_runs for insert
  with check ((select auth.uid()) = user_id and public.is_workspace_member(workspace_id));
drop policy if exists "wfrun_update" on public.workflow_runs;
create policy "wfrun_update" on public.workflow_runs for update
  using ((select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids()))
  with check ((select auth.uid()) = user_id and public.is_workspace_member(workspace_id));

-- ── agent_usage (select/insert=user_id) ──
drop policy if exists "usage_select" on public.agent_usage;
create policy "usage_select" on public.agent_usage for select
  using ((select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "usage_insert" on public.agent_usage;
create policy "usage_insert" on public.agent_usage for insert
  with check ((select auth.uid()) = user_id and public.is_workspace_member(workspace_id));

-- ── user_agent_pins (select/insert/delete=user_id) ──
drop policy if exists "uap_select" on public.user_agent_pins;
create policy "uap_select" on public.user_agent_pins for select
  using ((select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "uap_insert" on public.user_agent_pins;
create policy "uap_insert" on public.user_agent_pins for insert
  with check ((select auth.uid()) = user_id and public.is_workspace_member(workspace_id));
drop policy if exists "uap_delete" on public.user_agent_pins;
create policy "uap_delete" on public.user_agent_pins for delete
  using ((select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids()));

-- ── notifications (select/update=user_id, insert=인증). 트리거(definer)는 RLS 우회라 영향 없음 ──
drop policy if exists "notif_select" on public.notifications;
create policy "notif_select" on public.notifications for select
  using ((select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "notif_update" on public.notifications;
create policy "notif_update" on public.notifications for update
  using ((select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists "notif_insert" on public.notifications;
create policy "notif_insert" on public.notifications for insert
  with check (public.is_workspace_member(workspace_id));
