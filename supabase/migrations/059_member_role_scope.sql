-- 059: set_member_role/guard_profile_role의 권한 부여 범위를 좁힌다(교차 테넌트 권한상승 차단).
--
-- 배경: profiles.role은 전역 컬럼(034 "전역 테이블")이고 auth_is_admin()(045)은 워크스페이스 구분 없이
-- profiles.role='admin'만 본다. 058의 오너 검증은 "대상이 속한 어떤 워크스페이스든 호출자가 소유"면 통과라,
-- 멀티워크스페이스(B2 초대 흐름) 도입 시: 호출자가 소유한 Y의 멤버 Bob을 admin으로 올리면 Bob이
-- 호출자가 소유하지 않은 X에서도 admin 권한을 얻는다. 전역 role 변경은 "대상의 모든 워크스페이스를
-- 호출자가 소유"할 때만 허용하도록 좁힌다. (현재 단일테넌트에선 동작 동일 — 모두가 한 워크스페이스 소속.)

-- 호출자가 대상의 모든 소속 워크스페이스를 소유하는가 (전역 role 변경 인가 조건).
create or replace function public.owner_can_set_role(target uuid)
returns boolean language sql security definer stable set search_path = public
as $$
  select exists (
    -- 대상이 호출자 소유 워크스페이스에 1개 이상 소속(빈 멤버십이면 인가 불가)
    select 1 from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.user_id = target and w.owner_id = (select auth.uid())
  )
  and not exists (
    -- 대상이 호출자가 소유하지 않은 워크스페이스에 속하면 인가 불가(전역 role 오남용 차단)
    select 1 from public.workspace_members wm2
    where wm2.user_id = target
      and wm2.workspace_id not in (
        select id from public.workspaces where owner_id = (select auth.uid())
      )
  );
$$;
grant execute on function public.owner_can_set_role(uuid) to authenticated;

-- 가드 트리거: role 변경은 "대상의 모든 워크스페이스를 소유한" 호출자만.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not public.owner_can_set_role(new.id) then
      raise exception 'role change requires owning all of target workspaces';
    end if;
  end if;
  return new;
end
$$;

-- RPC: 동일 인가 조건으로 좁힌다.
create or replace function public.set_member_role(target uuid, new_role text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if new_role not in ('admin','member') then raise exception 'bad role'; end if;
  if not public.owner_can_set_role(target) then raise exception 'not owner'; end if;
  update public.profiles set role = new_role, updated_at = now() where id = target;
end
$$;
