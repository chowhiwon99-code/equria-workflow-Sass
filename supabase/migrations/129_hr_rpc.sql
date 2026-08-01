-- 129: HR RPC — 오너의 구성원 입사일 지정 + 근태 잔여(부여-사용) 집계
--
-- set_member_hire_date: 093 set_member_department 패턴(owner_can_set_role 게이트, profiles_update 본인RLS 우회).
-- attendance_balances: 101 admin_usage_by_member(오너 집계 RPC) + 064 can_view_attendance(오너 or 위임자) 패턴.
--   부여량(granted)/잔여(remaining)의 '법정 산식'은 서버 lib/hr.ts가 담당(순수함수·테스트 용이) —
--   RPC는 인원별 [기준연도 창](정책 grant_method/fiscal_start 반영)과 used 집계(연차/반차/월차 건수)만 반환.
-- 멱등(create or replace). 롤백 = 두 함수 drop.

-- ── 오너가 구성원 입사일 지정 ──
create or replace function public.set_member_hire_date(target uuid, p_hire_date date)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.owner_can_set_role(target) then raise exception 'not owner'; end if;
  update public.profiles set hire_date = p_hire_date, updated_at = now() where id = target;
end
$$;
revoke all on function public.set_member_hire_date(uuid, date) from public, anon;
grant execute on function public.set_member_hire_date(uuid, date) to authenticated;

-- ── 근태 잔여 집계(오너/위임자) ──
create or replace function public.attendance_balances(p_workspace uuid, p_as_of date default current_date)
returns table (
  user_id uuid, name text, hire_date date,
  year_start date, year_end date,
  used_annual int, used_half int, used_monthly int
)
language plpgsql security definer stable set search_path = public
as $$
declare
  v_method text := 'hire_date';
  v_fiscal text := '01-01';
begin
  -- 오너 또는 근태 위임자만(그 외 빈 결과)
  if not public.can_view_attendance(p_workspace) then
    return;
  end if;

  select coalesce(s.leave_policy->>'grant_method', 'hire_date'),
         coalesce(s.leave_policy->>'fiscal_start', '01-01')
    into v_method, v_fiscal
  from public.hr_settings s where s.workspace_id = p_workspace;
  v_method := coalesce(v_method, 'hire_date');
  v_fiscal := coalesce(v_fiscal, '01-01');

  return query
  with members as (
    select p.id as uid, p.name as nm, p.hire_date as hd
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = p_workspace and m.role <> 'guest'
  ),
  windows as (
    select uid, nm, hd,
      case
        when v_method = 'hire_date' and hd is not null
          then (hd + make_interval(years => greatest(0, floor(extract(year from age(p_as_of, hd)))::int)))::date
        else
          case
            when to_date(extract(year from p_as_of)::int::text || '-' || v_fiscal, 'YYYY-MM-DD') <= p_as_of
              then to_date(extract(year from p_as_of)::int::text || '-' || v_fiscal, 'YYYY-MM-DD')
              else to_date((extract(year from p_as_of)::int - 1)::text || '-' || v_fiscal, 'YYYY-MM-DD')
          end
      end as ys
    from members
  )
  select
    w.uid, w.nm, w.hd, w.ys, (w.ys + interval '1 year')::date,
    coalesce(sum((a.status = '연차')::int), 0)::int,
    coalesce(sum((a.status = '반차')::int), 0)::int,
    coalesce(sum((a.status = '월차')::int), 0)::int
  from windows w
  left join public.attendance_records a
    on a.user_id = w.uid
   and a.workspace_id = p_workspace
   and a.work_date >= w.ys
   and a.work_date < (w.ys + interval '1 year')::date
  group by w.uid, w.nm, w.hd, w.ys
  order by w.nm;
end
$$;
revoke all on function public.attendance_balances(uuid, date) from public, anon;
grant execute on function public.attendance_balances(uuid, date) to authenticated;

-- ── 롤백 ──
-- drop function if exists public.set_member_hire_date(uuid, date);
-- drop function if exists public.attendance_balances(uuid, date);
