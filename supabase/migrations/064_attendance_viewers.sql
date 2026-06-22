-- 064: 근태 열람 권한 — 대표(owner) + 대표가 지정한 위임자(attendance_viewers)만 전 직원 근태 열람.
-- 배경(045): att_select = 본인 OR auth_is_admin(). 대표(owner)는 role=member라 전체 못 봄 +
--   admin 자동열람은 '대표가 권한 부여' 모델과 안 맞음(세션10 결정). → 본인 OR (대표 OR 위임자)로 교체.
-- 위임자 기본 = 전 직원 열람·읽기전용(att_update/insert/delete는 045 그대로 본인만).
-- 멱등. 되돌리기 = att_select를 045(본인 OR auth_is_admin)로 복구 + 테이블/함수 drop.

-- ── 위임 대상 테이블 ──
create table if not exists public.attendance_viewers (
  workspace_id   uuid not null default '00000000-0000-0000-0000-0000000000e1' references public.workspaces(id) on delete cascade,
  viewer_user_id uuid not null references public.profiles(id) on delete cascade,
  granted_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (workspace_id, viewer_user_id)
);
create index if not exists idx_att_viewers_user on public.attendance_viewers (viewer_user_id);
alter table public.attendance_viewers enable row level security;

-- 조회: 같은 워크스페이스 멤버는 위임 목록을 볼 수 있다(UI 표시용). 쓰기 정책 없음 = RPC(정의자)만 변경.
drop policy if exists "av_select" on public.attendance_viewers;
create policy "av_select" on public.attendance_viewers for select using (
  workspace_id in (select public.auth_user_workspace_ids())
);

-- ── 열람 권한 헬퍼: 대표(owner) 또는 위임자 ──
create or replace function public.can_view_attendance(ws uuid)
returns boolean language sql security definer stable set search_path = public
as $$
  select
    public.auth_is_workspace_owner(ws)
    or exists (
      select 1 from public.attendance_viewers v
      where v.workspace_id = ws and v.viewer_user_id = (select auth.uid())
    );
$$;
grant execute on function public.can_view_attendance(uuid) to authenticated;

-- ── att_select 교체: 본인 OR (대표 OR 위임자) ──
drop policy if exists "att_select" on public.attendance_records;
create policy "att_select" on public.attendance_records for select using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = user_id or public.can_view_attendance(workspace_id))
);

-- ── 부여/회수 RPC(대표만). 대상이 대표 소유 워크스페이스 소속일 때만, workspace_id 명시 기록. ──
create or replace function public.grant_attendance_viewer(target uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  select w.id into ws
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id and w.owner_id = (select auth.uid())
  where wm.user_id = target
  limit 1;
  if ws is null then raise exception 'not owner or target not in your workspace'; end if;
  insert into public.attendance_viewers (workspace_id, viewer_user_id, granted_by)
  values (ws, target, (select auth.uid()))
  on conflict (workspace_id, viewer_user_id) do nothing;
end
$$;
grant execute on function public.grant_attendance_viewer(uuid) to authenticated;

create or replace function public.revoke_attendance_viewer(target uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  select w.id into ws
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id and w.owner_id = (select auth.uid())
  where wm.user_id = target
  limit 1;
  if ws is null then raise exception 'not owner or target not in your workspace'; end if;
  delete from public.attendance_viewers where workspace_id = ws and viewer_user_id = target;
end
$$;
grant execute on function public.revoke_attendance_viewer(uuid) to authenticated;
