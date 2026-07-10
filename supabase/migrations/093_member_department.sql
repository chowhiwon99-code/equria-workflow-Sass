-- 093: 대표(워크스페이스 오너)가 구성원 부서(profiles.department)를 지정.
-- 배경: department는 자유텍스트(001~)이고 지금은 본인이 SettingsView 프로필에서 자기 부서를 바꿀 수 있다(profiles_update RLS=본인).
-- 요청: 직급(063)처럼 대표도 직원 부서를 부여할 수 있어야 함. 자가입력은 그대로 두고, 오너용 RPC만 추가.
--  - set_member_department RPC(security definer)로 오너가 남의 부서 설정(profiles_update=본인만 RLS를 우회).
--  - guard_profile_role 트리거는 건드리지 않음(department는 계속 본인도 편집 가능 — role/position만 오너 전용).
-- 멱등. 되돌리기 = set_member_department drop.

create or replace function public.set_member_department(target uuid, new_department text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.owner_can_set_role(target) then raise exception 'not owner'; end if;
  update public.profiles set department = nullif(btrim(new_department), ''), updated_at = now() where id = target;
end
$$;
grant execute on function public.set_member_department(uuid, text) to authenticated;
