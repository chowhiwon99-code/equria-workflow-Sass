-- 038: B1-a 읽기 격리 — 채팅(DM). direct_conversations·direct_messages·message_attachments·message_reactions.
-- 기존 참여자(user_a/user_b, sender) 조건 보존 + workspace_id 격리.
-- 교차회사 DM 차단(레드팀 #5): 새 대화 생성은 두 참여자가 같은 워크스페이스를 공유할 때만(shares_workspace_with, 034 헬퍼).
-- 멱등.

-- ── direct_conversations ──
drop policy if exists "dc_select" on public.direct_conversations;
create policy "dc_select" on public.direct_conversations for select using (
  ((select auth.uid()) = user_a or (select auth.uid()) = user_b)
  and workspace_id in (select public.auth_user_workspace_ids())
);
drop policy if exists "dc_update" on public.direct_conversations;
create policy "dc_update" on public.direct_conversations for update using (
  ((select auth.uid()) = user_a or (select auth.uid()) = user_b)
  and workspace_id in (select public.auth_user_workspace_ids())
);
drop policy if exists "dc_insert" on public.direct_conversations;
create policy "dc_insert" on public.direct_conversations for insert with check (
  ((select auth.uid()) = user_a or (select auth.uid()) = user_b)
  and public.is_workspace_member(workspace_id)
  -- 상대도 같은 워크스페이스 멤버여야(교차회사 DM 차단)
  and public.shares_workspace_with(case when (select auth.uid()) = user_a then user_b else user_a end)
);

-- ── direct_messages (부모 direct_conversation 통한 격리 + 자체 workspace) ──
drop policy if exists "dm_select" on public.direct_messages;
create policy "dm_select" on public.direct_messages for select using (
  exists (select 1 from public.direct_conversations c
          where c.id = direct_messages.conversation_id
            and ((select auth.uid()) = c.user_a or (select auth.uid()) = c.user_b)
            and c.workspace_id in (select public.auth_user_workspace_ids()))
);
drop policy if exists "dm_insert" on public.direct_messages;
create policy "dm_insert" on public.direct_messages for insert with check (
  sender_id = (select auth.uid())
  and public.is_workspace_member(workspace_id)
  and exists (select 1 from public.direct_conversations c
              where c.id = direct_messages.conversation_id
                and ((select auth.uid()) = c.user_a or (select auth.uid()) = c.user_b)
                and c.workspace_id in (select public.auth_user_workspace_ids()))
);
drop policy if exists "dm_update" on public.direct_messages;
create policy "dm_update" on public.direct_messages for update
  using (sender_id = (select auth.uid()) and workspace_id in (select public.auth_user_workspace_ids()))
  with check (sender_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

-- ── message_attachments (부모 direct_message→direct_conversation 연쇄 + 자체 workspace) ──
drop policy if exists "ma_select" on public.message_attachments;
create policy "ma_select" on public.message_attachments for select using (
  exists (
    select 1 from public.direct_messages m
    join public.direct_conversations c on c.id = m.conversation_id
    where m.id = message_attachments.message_id
      and ((select auth.uid()) = c.user_a or (select auth.uid()) = c.user_b)
      and c.workspace_id in (select public.auth_user_workspace_ids())
  )
);
drop policy if exists "ma_insert" on public.message_attachments;
create policy "ma_insert" on public.message_attachments for insert with check (
  public.is_workspace_member(workspace_id)
  and exists (select 1 from public.direct_messages m
              where m.id = message_attachments.message_id and m.sender_id = (select auth.uid()))
);

-- ── message_reactions (부모 연쇄 + 자체 workspace) ──
drop policy if exists "mr_select" on public.message_reactions;
create policy "mr_select" on public.message_reactions for select using (
  exists (
    select 1 from public.direct_messages m
    join public.direct_conversations c on c.id = m.conversation_id
    where m.id = message_reactions.message_id
      and ((select auth.uid()) = c.user_a or (select auth.uid()) = c.user_b)
      and c.workspace_id in (select public.auth_user_workspace_ids())
  )
);
drop policy if exists "mr_insert" on public.message_reactions;
create policy "mr_insert" on public.message_reactions for insert
  with check ((select auth.uid()) = user_id and public.is_workspace_member(workspace_id));
drop policy if exists "mr_delete" on public.message_reactions;
create policy "mr_delete" on public.message_reactions for delete
  using ((select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids()));
