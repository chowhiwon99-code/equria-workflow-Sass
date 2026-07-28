-- 115: B2 — 워크스페이스 생성 RPC + 프리셋 복제 + 운영자 수동 셋업 (플랜 B-3)
--
-- create_workspace(이름): 가입 개방 후 온보딩 "새 워크스페이스 만들기"의 백엔드.
--   slug 자동 생성 → workspaces+오너 멤버십 → 전체방(group_rooms) → 시드 에이전트 8종 복제.
-- 프리셋 복제 = 대표 결정 "회사별 복제". 시드 프롬프트의 이큐리아/EQURIA/K-뷰티는
--   복제 시점에 중립 치환(원본 무변경 — equria 비활성 시드는 그대로 보존).
-- admin_create_workspace = 도입 문의 기업 수동 셋업(운영자 전용·권한 미부여=SQL Editor만):
--   오너 없는 워크스페이스 + 호스트용 owner 초대 링크 토큰(7일·1회) 반환.
-- 부수 픽스(R7): create_group_room이 limit 1로 워크스페이스를 고르던 것 →
--   guest 제외 + p_workspace 파라미터(기본 null=기존 동작) — 멀티멤버십 오귀속 방지.
-- 롤백: drop function create_workspace/admin_create_workspace/clone_seed_agents,
--   create_group_room은 074 원문 복원.

-- ── ① 시드 에이전트 복제 (내부 헬퍼 — 권한 미부여) ──
create or replace function public.clone_seed_agents(target_ws uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  with src as (
    select a.id, a.name, a.description, a.category, a.icon
    from public.agents a
    where a.workspace_id = '00000000-0000-0000-0000-0000000000e1' and a.created_by is null
  ), cloned as (
    insert into public.agents (workspace_id, name, description, category, icon, is_active, is_public, created_by)
    select target_ws, s.name, s.description, s.category, s.icon, true, true, null from src s
    returning id, name
  )
  insert into public.agent_versions
    (workspace_id, agent_id, version, system_prompt, model, max_tokens, temperature,
     tools, mcp_servers, mcp_connectors, is_current, created_by)
  select target_ws, c.id, 1,
         replace(replace(replace(v.system_prompt, '이큐리아', '우리 회사'), 'EQURIA', '우리 회사'), 'K-뷰티', '우리 업계'),
         v.model, v.max_tokens, v.temperature, v.tools, v.mcp_servers, v.mcp_connectors, true, null
  from cloned c
  join src s on s.name = c.name
  join public.agent_versions v on v.agent_id = s.id and v.is_current;
  get diagnostics cnt = row_count;
  return cnt;
end $$;
revoke execute on function public.clone_seed_agents(uuid) from public, anon, authenticated;

-- ── ② 워크스페이스 생성 (온보딩용 — authenticated) ──
create or replace function public.create_workspace(p_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); ws uuid; base_slug text; new_slug text; nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  nm := nullif(trim(p_name), '');
  if nm is null or length(nm) > 80 then raise exception 'bad name'; end if;

  base_slug := regexp_replace(lower(nm), '[^a-z0-9]+', '-', 'g');
  base_slug := coalesce(nullif(trim(both '-' from base_slug), ''), 'ws');
  new_slug := base_slug;
  while exists (select 1 from public.workspaces where slug = new_slug) loop
    new_slug := base_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
  end loop;

  insert into public.workspaces (name, slug, plan, owner_id) values (nm, new_slug, 'free', uid)
  returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, uid, 'owner');
  insert into public.group_rooms (workspace_id, name, is_default, created_by)
  values (ws, '전체', true, uid);
  perform public.clone_seed_agents(ws);

  return jsonb_build_object('id', ws, 'slug', new_slug, 'name', nm);
end $$;
revoke execute on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;

-- ── ③ 운영자 수동 셋업 (도입 문의 — 권한 미부여 = SQL Editor/service_role 전용) ──
--    사용법: select public.admin_create_workspace('회사명','slug');
--    반환된 토큰으로 https://complow.kr/join/<토큰> 을 고객 호스트에게 전달.
create or replace function public.admin_create_workspace(p_name text, p_slug text)
returns text
language plpgsql security definer set search_path = public as $$
declare ws uuid; tok text;
begin
  insert into public.workspaces (name, slug, plan, owner_id) values (p_name, p_slug, 'free', null)
  returning id into ws;
  insert into public.group_rooms (workspace_id, name, is_default) values (ws, '전체', true);
  perform public.clone_seed_agents(ws);
  tok := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.workspace_invites (workspace_id, token, role, expires_at, max_uses, created_by)
  values (ws, tok, 'owner', now() + interval '7 days', 1, null);
  return tok;
end $$;
revoke execute on function public.admin_create_workspace(text, text) from public, anon, authenticated;

-- ── ④ create_group_room 픽스(074 대체): guest 제외 + 명시 워크스페이스(기본=기존 동작) ──
drop function if exists public.create_group_room(text, uuid[]);
create or replace function public.create_group_room(p_name text, p_members uuid[], p_workspace uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; ws uuid;
begin
  select workspace_id into ws from public.workspace_members
  where user_id = (select auth.uid()) and role <> 'guest'
    and (p_workspace is null or workspace_id = p_workspace)
  limit 1;
  if ws is null then raise exception 'not a workspace member'; end if;
  insert into public.group_rooms (workspace_id, name, is_default, created_by)
  values (ws, coalesce(nullif(trim(p_name), ''), '그룹 채팅'), false, (select auth.uid()))
  returning id into rid;
  insert into public.room_members (room_id, user_id)
  select rid, u from (select distinct unnest(array_append(p_members, (select auth.uid()))) as u) s
  where exists (select 1 from public.workspace_members wm where wm.workspace_id = ws and wm.user_id = s.u)
  on conflict do nothing;
  return rid;
end $$;
revoke execute on function public.create_group_room(text, uuid[], uuid) from public, anon;
grant execute on function public.create_group_room(text, uuid[], uuid) to authenticated;
