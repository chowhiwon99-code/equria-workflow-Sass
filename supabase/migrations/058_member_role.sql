-- 058: 대표(워크스페이스 오너)가 구성원 권한(admin/member)을 지정. role 자가변경 차단.
--
-- profiles_update RLS는 'auth.uid()=id'(본인만)이라 남의 role을 못 바꾼다 → RPC로 일원화.
-- 동시에 본인이 자기 role을 admin으로 올리는 self-escalation을 트리거로 차단(오너만 role 변경 가능).

-- role 변경 가드: target의 워크스페이스 오너만 role을 바꿀 수 있다.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not exists (
      select 1 from public.workspace_members wm
      join public.workspaces w on w.id = wm.workspace_id and w.owner_id = (select auth.uid())
      where wm.user_id = new.id
    ) then
      raise exception 'role change requires workspace owner';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role before update on public.profiles for each row execute function public.guard_profile_role();

-- 오너가 구성원 권한 설정(RPC).
create or replace function public.set_member_role(target uuid, new_role text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if new_role not in ('admin','member') then raise exception 'bad role'; end if;
  if not exists (
    select 1 from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id and w.owner_id = (select auth.uid())
    where wm.user_id = target
  ) then
    raise exception 'not owner';
  end if;
  update public.profiles set role = new_role, updated_at = now() where id = target;
end
$$;
grant execute on function public.set_member_role(uuid, text) to authenticated;
