-- 074: 그룹방 다중화(카카오톡식) — 멤버 초대로 3·4명 방 생성. 전체방(default)은 워크스페이스 전원 유지.
-- is_room_member 재작성: default=워크스페이스 멤버 / 커스텀=room_members. 기존 메시지 RLS는 그대로 동작.

-- ── 방 멤버 ──
create table if not exists public.room_members (
  room_id uuid not null references public.group_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists idx_room_members_user on public.room_members (user_id);

alter table public.room_members enable row level security;
-- 내가 속한 방의 멤버 목록만 열람(헬퍼는 SECURITY DEFINER라 재귀 없음). 쓰기는 RPC(definer)만.
drop policy if exists rm_select on public.room_members;
create policy rm_select on public.room_members for select
  using (public.is_room_member(room_id));

-- ── is_room_member 재작성: default→워크스페이스 / 커스텀→room_members ──
create or replace function public.is_room_member(p_room uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_rooms r
    where r.id = p_room
      and (
        (r.is_default and public.is_workspace_member(r.workspace_id))
        or exists (select 1 from public.room_members rm where rm.room_id = r.id and rm.user_id = (select auth.uid()))
      )
  );
$$;

-- ── group_rooms SELECT: 내가 속한 방만(전체방은 is_room_member→default→워크스페이스로 통과) ──
drop policy if exists grooms_select on public.group_rooms;
create policy grooms_select on public.group_rooms for select
  using (public.is_room_member(id));

-- ── RPC: 그룹방 생성(멤버 초대) ──
create or replace function public.create_group_room(p_name text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; ws uuid;
begin
  select workspace_id into ws from public.workspace_members where user_id = (select auth.uid()) limit 1;
  if ws is null then raise exception 'not a workspace member'; end if;
  insert into public.group_rooms (workspace_id, name, is_default, created_by)
  values (ws, coalesce(nullif(trim(p_name), ''), '그룹 채팅'), false, (select auth.uid()))
  returning id into rid;
  -- 생성자 + 초대 멤버(같은 워크스페이스만, 중복 제거)
  insert into public.room_members (room_id, user_id)
  select rid, u from (select distinct unnest(array_append(p_members, (select auth.uid()))) as u) s
  where exists (select 1 from public.workspace_members wm where wm.workspace_id = ws and wm.user_id = s.u)
  on conflict do nothing;
  return rid;
end;
$$;

-- ── RPC: 멤버 초대(기존 멤버 누구나) ──
create or replace function public.add_room_members(p_room uuid, p_members uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if not public.is_room_member(p_room) then raise exception 'not a room member'; end if;
  if exists (select 1 from public.group_rooms where id = p_room and is_default) then raise exception 'cannot modify default room'; end if;
  select workspace_id into ws from public.group_rooms where id = p_room;
  insert into public.room_members (room_id, user_id)
  select p_room, u from unnest(p_members) u
  where exists (select 1 from public.workspace_members wm where wm.workspace_id = ws and wm.user_id = u)
  on conflict do nothing;
end;
$$;

-- ── RPC: 방 나가기(전체방 제외) ──
create or replace function public.leave_group_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.group_rooms where id = p_room and is_default) then raise exception 'cannot leave default room'; end if;
  delete from public.room_members where room_id = p_room and user_id = (select auth.uid());
end;
$$;

-- ── 권한 하드닝(012 패턴) ──
revoke execute on function public.create_group_room(text, uuid[]) from public, anon;
revoke execute on function public.add_room_members(uuid, uuid[]) from public, anon;
revoke execute on function public.leave_group_room(uuid) from public, anon;
grant execute on function public.create_group_room(text, uuid[]) to authenticated;
grant execute on function public.add_room_members(uuid, uuid[]) to authenticated;
grant execute on function public.leave_group_room(uuid) to authenticated;

-- ── realtime: 멤버 변동 반영 ──
alter publication supabase_realtime add table public.room_members;
