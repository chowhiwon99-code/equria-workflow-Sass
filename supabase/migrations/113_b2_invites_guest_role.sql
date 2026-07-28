-- 113: B2 — 워크스페이스 초대 링크(workspace_invites) + guest 역할 허용 (설계: prancy-whistling-tome 플랜 B-1)
--
-- 노션식 "링크 복사" 초대: 오너/관리자가 링크 발급 → 받은 사람이 구글 로그인 후 수락 → 멤버십 생성.
-- 이메일 발송 인프라 불요(토큰 URL 공유). 토큰은 재복사 요구 때문에 평문 저장 + admin 전용 RLS로 보호
-- (해시는 재표시 불가라 제품 요구와 충돌 · 엔트로피 192bit로 브루트포스 방어).
-- 게스트 = 프로젝트 단위 접근(대표 결정 2026-07-28) — RLS 강제는 마이그 114에서.
-- 롤백: drop function 4종·drop table workspace_invites·role check를 ('owner','admin','member')로 복원.

-- ① workspace_members에 'guest' 역할 허용
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check
  check (role in ('owner','admin','member','guest'));

-- ② 초대 링크 테이블
create table if not exists public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token        text unique not null,
  role         text not null default 'member' check (role in ('owner','member','guest')),
  project_ids  uuid[] not null default '{}',  -- role='guest'일 때 접근 허용 프로젝트
  created_by   uuid references public.profiles(id) on delete set null,
  expires_at   timestamptz not null default now() + interval '30 days',
  max_uses     int,                            -- null = 무제한
  use_count    int not null default 0,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_ws_invites_ws on public.workspace_invites (workspace_id);
alter table public.workspace_invites enable row level security;

-- 오너 or workspace_members.role in (owner,admin) — 초대 관리 권한 판정 헬퍼
create or replace function public.is_workspace_admin(ws_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.workspaces w
                 where w.id = ws_id and w.owner_id = (select auth.uid()))
      or exists (select 1 from public.workspace_members wm
                 where wm.workspace_id = ws_id and wm.user_id = (select auth.uid())
                   and wm.role in ('owner','admin'))
$$;

-- 열람 = 관리자만(토큰 재복사용). 발급/철회/수락은 RPC(definer) 경유만 — INSERT/UPDATE 정책 없음.
drop policy if exists "wsi_select" on public.workspace_invites;
create policy "wsi_select" on public.workspace_invites for select
  using (public.is_workspace_admin(workspace_id));

-- ③ 발급 — 오너/관리자만. 게스트 링크는 대상 프로젝트 필수 + 소속 검증.
create or replace function public.create_workspace_invite(
  p_workspace uuid, p_role text, p_project_ids uuid[] default '{}',
  p_expires_days int default 30, p_max_uses int default null
) returns public.workspace_invites
language plpgsql security definer set search_path = public as $$
declare inv public.workspace_invites;
begin
  if not public.is_workspace_admin(p_workspace) then raise exception 'not workspace admin'; end if;
  if p_role not in ('member','guest') then raise exception 'bad role'; end if;
  if p_role = 'guest' and (p_project_ids is null or array_length(p_project_ids, 1) is null) then
    raise exception 'guest invite requires projects';
  end if;
  if p_role = 'guest' and exists (
    select 1 from unnest(p_project_ids) pid
    left join public.projects p on p.id = pid
    where p.id is null or p.workspace_id <> p_workspace
  ) then raise exception 'project not in workspace'; end if;

  insert into public.workspace_invites (workspace_id, token, role, project_ids, created_by, expires_at, max_uses)
  values (
    p_workspace,
    translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_'),
    p_role, coalesce(p_project_ids, '{}'), (select auth.uid()),
    now() + make_interval(days => greatest(1, least(coalesce(p_expires_days, 30), 365))),
    p_max_uses
  )
  returning * into inv;
  return inv;
end $$;

-- ④ 철회
create or replace function public.revoke_workspace_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.workspace_invites set revoked_at = now()
  where id = p_invite and public.is_workspace_admin(workspace_id) and revoked_at is null;
end $$;

-- ⑤ 미리보기(/join 화면·로그인 전) — 워크스페이스 이름·역할·유효 여부만 최소 노출
create or replace function public.get_invite_preview(p_token text)
returns table (workspace_name text, invite_role text, valid boolean)
language sql security definer stable set search_path = public as $$
  select w.name, i.role,
         (i.revoked_at is null and i.expires_at > now()
          and (i.max_uses is null or i.use_count < i.max_uses))
  from public.workspace_invites i
  join public.workspaces w on w.id = i.workspace_id
  where i.token = p_token
$$;

-- ⑥ 수락 — FOR UPDATE 직렬화(max_uses 경합). 이미 멤버면 do nothing(강등 방지).
--    owner 링크(운영자 수동 셋업 전용)는 무주공산(owner_id null)일 때만 오너 승계.
create or replace function public.accept_workspace_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv public.workspace_invites; uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.workspace_invites where token = p_token for update;
  if not found then raise exception 'invite invalid or expired'; end if;
  if inv.revoked_at is not null or inv.expires_at <= now()
     or (inv.max_uses is not null and inv.use_count >= inv.max_uses) then
    raise exception 'invite invalid or expired';
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

-- ⑦ 권한 하드닝 — preview만 anon 허용, 나머지는 로그인 필수. 관리 함수는 authenticated만.
revoke execute on function public.create_workspace_invite(uuid, text, uuid[], int, int) from public, anon;
grant execute on function public.create_workspace_invite(uuid, text, uuid[], int, int) to authenticated;
revoke execute on function public.revoke_workspace_invite(uuid) from public, anon;
grant execute on function public.revoke_workspace_invite(uuid) to authenticated;
revoke execute on function public.accept_workspace_invite(text) from public, anon;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
revoke execute on function public.is_workspace_admin(uuid) from public, anon;
grant execute on function public.is_workspace_admin(uuid) to authenticated;
