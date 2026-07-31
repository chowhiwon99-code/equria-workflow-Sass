-- 125: 플랜 시트 게이팅(세션41 — 무료=3석·초과 시 업그레이드)
-- accept_workspace_invite에 시트 한도 강제 추가: 비게스트 멤버 수가 플랜 한도에 도달하면 초대 수락을 막는다(우회 불가 서버 게이트).
-- 시트 = 비게스트(owner/member/admin) 멤버 수. 게스트는 시트 미소비. 한도: free=3·standard=5·pro=10·premium=무제한.
-- 롤백: 아래 함수를 마이그 113 원본으로 되돌린다(git 113_b2_invites_guest_role.sql).

-- 플랜 → 시트 한도(무제한은 NULL). src/lib/plans.ts와 반드시 일치.
create or replace function public.plan_seat_limit(p_plan text)
returns int language sql immutable set search_path = public as $$
  select case coalesce(p_plan, 'free')
           when 'free' then 3
           when 'standard' then 5
           when 'pro' then 10
           when 'premium' then null
           else 3
         end
$$;

create or replace function public.accept_workspace_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inv public.workspace_invites;
  uid uuid := (select auth.uid());
  seat_limit int;
  seats_used int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.workspace_invites where token = p_token for update;
  if not found then raise exception 'invite invalid or expired'; end if;
  if inv.revoked_at is not null or inv.expires_at <= now()
     or (inv.max_uses is not null and inv.use_count >= inv.max_uses) then
    raise exception 'invite invalid or expired';
  end if;

  -- 시트 게이팅(세션41) — 비게스트 초대만 한도 검사. 이미 멤버면(재수락) 통과.
  if inv.role <> 'guest'
     and not exists (select 1 from public.workspace_members m where m.workspace_id = inv.workspace_id and m.user_id = uid) then
    select public.plan_seat_limit(w.plan) into seat_limit from public.workspaces w where w.id = inv.workspace_id;
    if seat_limit is not null then
      select count(*) into seats_used from public.workspace_members m
        where m.workspace_id = inv.workspace_id and coalesce(m.role, 'member') <> 'guest';
      if seats_used >= seat_limit then
        raise exception 'seat limit reached' using errcode = 'P0001';
      end if;
    end if;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, uid, case when inv.role = 'owner' then 'owner' else inv.role end)
  on conflict (workspace_id, user_id) do nothing;

  if inv.role = 'owner' then
    update public.workspaces set owner_id = uid where id = inv.workspace_id and owner_id is null;
  end if;

  if inv.role = 'guest' then
    insert into public.project_members (project_id, user_id, workspace_id)
    select pid, uid, inv.workspace_id
    from unnest(inv.project_ids) pid
    where exists (select 1 from public.projects p where p.id = pid and p.workspace_id = inv.workspace_id)
    on conflict (project_id, user_id) do nothing;
  end if;

  update public.workspace_invites set use_count = use_count + 1 where id = inv.id;
  return (select jsonb_build_object('workspace_id', w.id, 'slug', w.slug, 'name', w.name)
          from public.workspaces w where w.id = inv.workspace_id);
end $$;

revoke execute on function public.accept_workspace_invite(text) from public, anon;
grant execute on function public.accept_workspace_invite(text) to authenticated;
revoke execute on function public.plan_seat_limit(text) from public, anon;
grant execute on function public.plan_seat_limit(text) to authenticated;
