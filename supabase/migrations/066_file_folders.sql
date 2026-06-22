-- 066: 파일 폴더 정리(file_folders + files.folder_id).
-- 회의노트 폴더(065)와 같은 공용 폴더 패턴. 단 파일은 개인/부서/공개 가시성이 있어
-- 폴더 '이동'은 회의노트(멤버 누구나)보다 보수적: 파일 소유자 또는 대표(owner)/관리자만.
-- 폴더 삭제 시 파일은 on delete set null로 보존(미분류). 멱등.

create table if not exists public.file_folders (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1' references public.workspaces(id) on delete cascade,
  created_by   uuid references public.profiles(id) on delete set null,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_ff_ws on public.file_folders (workspace_id, sort, created_at);
alter table public.file_folders enable row level security;

drop policy if exists "ff_select" on public.file_folders;
create policy "ff_select" on public.file_folders for select using (
  workspace_id in (select public.auth_user_workspace_ids())
);
drop policy if exists "ff_insert" on public.file_folders;
create policy "ff_insert" on public.file_folders for insert with check (
  public.is_workspace_member(workspace_id) and (select auth.uid()) = created_by
);
drop policy if exists "ff_update" on public.file_folders;
create policy "ff_update" on public.file_folders for update using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = created_by or public.auth_is_workspace_owner(workspace_id) or public.auth_is_admin())
) with check (
  workspace_id in (select public.auth_user_workspace_ids())
);
drop policy if exists "ff_delete" on public.file_folders;
create policy "ff_delete" on public.file_folders for delete using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = created_by or public.auth_is_workspace_owner(workspace_id) or public.auth_is_admin())
);

alter table public.files add column if not exists folder_id uuid references public.file_folders(id) on delete set null;
create index if not exists idx_files_folder on public.files (workspace_id, folder_id);

-- 파일 폴더 이동: 파일 소유자 또는 대표/관리자만, folder_id만 변경.
create or replace function public.set_file_folder(p_file uuid, p_folder uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid; own uuid;
begin
  select workspace_id, owner_id into ws, own from public.files where id = p_file;
  if ws is null then raise exception 'file not found'; end if;
  if not (own = (select auth.uid()) or public.auth_is_workspace_owner(ws) or public.auth_is_admin()) then
    raise exception 'not allowed';
  end if;
  if p_folder is not null and not exists (
    select 1 from public.file_folders f where f.id = p_folder and f.workspace_id = ws
  ) then raise exception 'folder not in workspace'; end if;
  update public.files set folder_id = p_folder where id = p_file;
end
$$;
grant execute on function public.set_file_folder(uuid, uuid) to authenticated;
