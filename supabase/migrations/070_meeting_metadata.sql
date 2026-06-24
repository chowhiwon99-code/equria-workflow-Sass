-- 070: 회의 메타데이터 — 사용자 정의 분류(meeting_categories) + 회의 속성(분류·중요도·일시).
-- 노션 데이터베이스식 회의 관리. 분류=워크스페이스 멤버가 직접 생성(이름·색). 중요도=고정 등급(0없음~4긴급).
-- 메타 변경은 폴더(065) 패턴대로 RPC로 — 본문 편집권한과 분리해 멤버 누구나 분류/중요도 설정.

-- 사용자 정의 분류(팀/부서 등)
create table if not exists public.meeting_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1',
  name text not null,
  color text not null default 'gray', -- gray/red/orange/yellow/green/blue/purple (UI 토큰)
  sort_order int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_meeting_cat_ws on public.meeting_categories (workspace_id, sort_order);

alter table public.meeting_categories enable row level security;
drop policy if exists mcat_select on public.meeting_categories;
create policy mcat_select on public.meeting_categories for select
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists mcat_insert on public.meeting_categories;
create policy mcat_insert on public.meeting_categories for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists mcat_update on public.meeting_categories;
create policy mcat_update on public.meeting_categories for update
  using (workspace_id in (select public.auth_user_workspace_ids()))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists mcat_delete on public.meeting_categories;
create policy mcat_delete on public.meeting_categories for delete
  using (workspace_id in (select public.auth_user_workspace_ids()));

-- 회의 속성(추가형 — 기존 데이터 무영향)
alter table public.meeting_notes add column if not exists category_id uuid references public.meeting_categories(id) on delete set null;
alter table public.meeting_notes add column if not exists importance int not null default 0;
alter table public.meeting_notes add column if not exists meeting_date date;
alter table public.meeting_notes add column if not exists meeting_time text;
create index if not exists idx_meeting_notes_cat on public.meeting_notes (category_id);

-- 메타 설정 RPC — 멤버 누구나(본문 편집권한과 분리). 전달한 값으로 세팅.
create or replace function public.set_meeting_meta(
  p_note uuid,
  p_category uuid,
  p_importance int,
  p_date date,
  p_time text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare ws uuid;
begin
  select workspace_id into ws from public.meeting_notes where id = p_note;
  if ws is null then raise exception 'meeting not found'; end if;
  if not public.is_workspace_member(ws) then raise exception 'not a workspace member'; end if;
  update public.meeting_notes
     set category_id = p_category,
         importance = coalesce(p_importance, 0),
         meeting_date = p_date,
         meeting_time = p_time
   where id = p_note;
end;
$$;
