-- 071: 그룹 채팅(단일 전체방) — DM(direct_*) 전혀 미접촉, 별도 테이블로 병렬 구축.
-- 단일 공유방 = 방 멤버 = 워크스페이스 멤버. RLS = is_workspace_member 하나로 단순·안전.
-- 재사용: 메시지/첨부/반응 모델은 DM과 동형(컴포넌트 재사용). 읽음은 그룹용 read_state로 분리.

-- ── 방 ──────────────────────────────────────────────
create table if not exists public.group_rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1' references public.workspaces(id) on delete cascade,
  name text not null default '전체 채팅',
  is_default boolean not null default false,
  created_by uuid references public.profiles(id),
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
-- 워크스페이스당 기본방 1개 보장
create unique index if not exists uniq_group_rooms_default on public.group_rooms (workspace_id) where is_default;

-- ── 메시지 (DM과 동형: body_json/스레드/soft-delete/edited) ──
create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.group_rooms(id) on delete cascade,
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1' references public.workspaces(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  body_json jsonb,
  parent_id uuid references public.group_messages(id) on delete set null,
  root_id uuid,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_gm_room on public.group_messages (room_id, created_at);

-- ── 첨부 ──
create table if not exists public.group_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.group_messages(id) on delete cascade,
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1' references public.workspaces(id) on delete cascade,
  storage_path text not null,
  name text,
  mime_type text,
  size bigint,
  created_at timestamptz not null default now()
);
create index if not exists idx_gma_msg on public.group_message_attachments (message_id);
create index if not exists idx_gma_path on public.group_message_attachments (storage_path);

-- ── 반응 ──
create table if not exists public.group_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.group_messages(id) on delete cascade,
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1' references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

-- ── 읽음 상태(방별·사용자별 마지막 읽은 시각) ──
create table if not exists public.group_read_state (
  room_id uuid not null references public.group_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- ── 멤버십 헬퍼 (결재 is_approval_participant 선례) ──
create or replace function public.is_room_member(p_room uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_rooms r
    where r.id = p_room and public.is_workspace_member(r.workspace_id)
  );
$$;

-- ── RLS ──────────────────────────────────────────────
alter table public.group_rooms enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_message_attachments enable row level security;
alter table public.group_message_reactions enable row level security;
alter table public.group_read_state enable row level security;

drop policy if exists grooms_select on public.group_rooms;
create policy grooms_select on public.group_rooms for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists gmsg_select on public.group_messages;
create policy gmsg_select on public.group_messages for select
  using (public.is_room_member(room_id));
drop policy if exists gmsg_insert on public.group_messages;
create policy gmsg_insert on public.group_messages for insert
  with check (sender_id = auth.uid() and public.is_room_member(room_id));
drop policy if exists gmsg_update on public.group_messages;
create policy gmsg_update on public.group_messages for update
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());

drop policy if exists gatt_select on public.group_message_attachments;
create policy gatt_select on public.group_message_attachments for select
  using (exists (select 1 from public.group_messages m where m.id = message_id and public.is_room_member(m.room_id)));
drop policy if exists gatt_insert on public.group_message_attachments;
create policy gatt_insert on public.group_message_attachments for insert
  with check (exists (select 1 from public.group_messages m where m.id = message_id and m.sender_id = auth.uid()));

drop policy if exists greact_select on public.group_message_reactions;
create policy greact_select on public.group_message_reactions for select
  using (exists (select 1 from public.group_messages m where m.id = message_id and public.is_room_member(m.room_id)));
drop policy if exists greact_insert on public.group_message_reactions;
create policy greact_insert on public.group_message_reactions for insert
  with check (user_id = auth.uid() and exists (select 1 from public.group_messages m where m.id = message_id and public.is_room_member(m.room_id)));
drop policy if exists greact_delete on public.group_message_reactions;
create policy greact_delete on public.group_message_reactions for delete
  using (user_id = auth.uid());

drop policy if exists grs_all on public.group_read_state;
create policy grs_all on public.group_read_state for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 트리거: 메시지 INSERT 시 방 last_message_at 갱신 ──
create or replace function public.touch_group_room()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.group_rooms set last_message_at = now() where id = new.room_id;
  return new;
end;
$$;
drop trigger if exists trg_touch_group_room on public.group_messages;
create trigger trg_touch_group_room after insert on public.group_messages
  for each row execute function public.touch_group_room();

-- ── RPC: 방 읽음 처리 ──
create or replace function public.mark_room_read(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_room_member(p_room) then raise exception 'not a room member'; end if;
  insert into public.group_read_state (room_id, user_id, last_read_at)
  values (p_room, auth.uid(), now())
  on conflict (room_id, user_id) do update set last_read_at = now();
end;
$$;

-- ── Realtime ──
alter publication supabase_realtime add table public.group_messages;
alter publication supabase_realtime add table public.group_message_reactions;
alter publication supabase_realtime add table public.group_message_attachments;
alter publication supabase_realtime add table public.group_rooms;
alter table public.group_message_reactions replica identity full;
alter table public.group_message_attachments replica identity full;

-- ── 기본방 시드(EQURIA 워크스페이스) ──
insert into public.group_rooms (workspace_id, name, is_default)
values ('00000000-0000-0000-0000-0000000000e1', '전체 채팅', true)
on conflict do nothing;
