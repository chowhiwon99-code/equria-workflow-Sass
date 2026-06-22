-- 063: 대표(워크스페이스 오너)가 구성원 직급(profiles.position)을 지정. 직급 자가변경 차단.
-- 배경: position은 자유텍스트(022)이고 지금은 본인이 SettingsView에서 자기 직급을 바꿀 수 있다(profiles_update RLS=본인).
-- 정책(세션10 확정): 직급은 '대표(owner)만' 설정(자유 입력). 역할부여 패턴(058/059)을 그대로 복제.
--  - guard_profile_role 트리거에 position 가드 추가(대상의 모든 워크스페이스를 소유한 호출자만 position 변경). role 절은 그대로.
--  - set_member_position RPC(security definer)로 오너가 남의 직급 설정(profiles_update=본인만 RLS를 우회).
-- 멱등. 되돌리기 = 트리거에서 position 절 제거 + set_member_position drop.

-- 가드 트리거: role + position 변경 모두 '대상의 모든 워크스페이스를 소유한' 호출자만(owner_can_set_role, 059).
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not public.owner_can_set_role(new.id) then
      raise exception 'role change requires owning all of target workspaces';
    end if;
  end if;
  if new.position is distinct from old.position then
    if not public.owner_can_set_role(new.id) then
      raise exception 'position change requires workspace owner';
    end if;
  end if;
  return new;
end
$$;
-- 트리거(trg_guard_profile_role)는 058에서 이미 BEFORE UPDATE로 연결됨 — 함수만 교체.

-- RPC: 오너가 구성원 직급 설정(자유 텍스트, 공백=NULL). profiles_update(본인만) RLS 우회용.
create or replace function public.set_member_position(target uuid, new_position text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.owner_can_set_role(target) then raise exception 'not owner'; end if;
  update public.profiles set position = nullif(btrim(new_position), ''), updated_at = now() where id = target;
end
$$;
grant execute on function public.set_member_position(uuid, text) to authenticated;
