-- 065: 회의노트 폴더 정리(meeting_note_folders + meeting_notes.folder_id).
-- 회의록은 워크스페이스 공유(046)라 폴더도 공용: 멤버 누구나 생성, 노트 이동은 좁은 RPC(folder_id만).
-- 폴더 삭제 시 노트는 on delete set null로 보존(미분류). 멱등.

create table if not exists public.meeting_note_folders (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1' references public.workspaces(id) on delete cascade,
  created_by   uuid references public.profiles(id) on delete set null,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_mnf_ws on public.meeting_note_folders (workspace_id, sort, created_at);
alter table public.meeting_note_folders enable row level security;

drop policy if exists "mnf_select" on public.meeting_note_folders;
create policy "mnf_select" on public.meeting_note_folders for select using (
  workspace_id in (select public.auth_user_workspace_ids())
);
drop policy if exists "mnf_insert" on public.meeting_note_folders;
create policy "mnf_insert" on public.meeting_note_folders for insert with check (
  public.is_workspace_member(workspace_id) and (select auth.uid()) = created_by
);
-- 이름변경/삭제 = 만든 사람 또는 대표(owner)/관리자.
drop policy if exists "mnf_update" on public.meeting_note_folders;
create policy "mnf_update" on public.meeting_note_folders for update using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = created_by or public.auth_is_workspace_owner(workspace_id) or public.auth_is_admin())
) with check (
  workspace_id in (select public.auth_user_workspace_ids())
);
drop policy if exists "mnf_delete" on public.meeting_note_folders;
create policy "mnf_delete" on public.meeting_note_folders for delete using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = created_by or public.auth_is_workspace_owner(workspace_id) or public.auth_is_admin())
);

alter table public.meeting_notes add column if not exists folder_id uuid references public.meeting_note_folders(id) on delete set null;
create index if not exists idx_meeting_notes_folder on public.meeting_notes (workspace_id, folder_id);

-- 노트 폴더 이동: 워크스페이스 멤버 누구나, folder_id만 변경(본문/제목 수정 권한과 분리).
create or replace function public.set_meeting_note_folder(note_id uuid, new_folder uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  select workspace_id into ws from public.meeting_notes where id = note_id;
  if ws is null then raise exception 'note not found'; end if;
  if not public.is_workspace_member(ws) then raise exception 'not a workspace member'; end if;
  if new_folder is not null and not exists (
    select 1 from public.meeting_note_folders f where f.id = new_folder and f.workspace_id = ws
  ) then raise exception 'folder not in workspace'; end if;
  update public.meeting_notes set folder_id = new_folder, updated_at = now() where id = note_id;
end
$$;
grant execute on function public.set_meeting_note_folder(uuid, uuid) to authenticated;
