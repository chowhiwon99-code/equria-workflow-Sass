-- 051: 공지사항(announcements) — 워크스페이스 공용 읽기, 오너만 작성/수정/삭제.
--
-- "오너만 올릴 수 있도록": 오너 = workspaces.owner_id(= 조휘원). role='admin'이 아니라
-- 워크스페이스 소유자로 게이트한다(현재 전원 profiles.role='member'이고 owner는 owner_id로 식별).
-- 헬퍼 auth_is_workspace_owner는 B1 헬퍼들과 동일하게 security definer stable.

create or replace function public.auth_is_workspace_owner(ws_id uuid)
returns boolean language sql security definer stable set search_path = public
as $$ select exists (select 1 from public.workspaces where id = ws_id and owner_id = (select auth.uid())) $$;
grant execute on function public.auth_is_workspace_owner(uuid) to authenticated;

create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null default '',
  content      text not null default '',
  pinned       boolean not null default false,
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_announcements_ws on public.announcements (workspace_id, pinned desc, created_at desc);
alter table public.announcements enable row level security;

-- SELECT: 워크스페이스 멤버 전원 열람.
drop policy if exists "ann_select" on public.announcements;
create policy "ann_select" on public.announcements for select using (
  workspace_id in (select public.auth_user_workspace_ids())
);
-- INSERT: 오너 본인 명의만.
drop policy if exists "ann_insert" on public.announcements;
create policy "ann_insert" on public.announcements for insert with check (
  (select auth.uid()) = user_id and public.auth_is_workspace_owner(workspace_id)
);
-- UPDATE: 오너만.
drop policy if exists "ann_update" on public.announcements;
create policy "ann_update" on public.announcements for update using (
  public.auth_is_workspace_owner(workspace_id)
) with check (
  public.auth_is_workspace_owner(workspace_id)
);
-- DELETE: 오너만.
drop policy if exists "ann_delete" on public.announcements;
create policy "ann_delete" on public.announcements for delete using (
  public.auth_is_workspace_owner(workspace_id)
);
