-- 046: 팀 회의 노트(meeting_notes) — 워크스페이스 공유 회의록.
--
-- B1 멀티테넌시 패턴 준수: workspace_id NOT NULL DEFAULT sentinel(equria).
-- ★ 045(근태/지출/휴가, 비공개=본인·관리자)와의 핵심 차이: 회의록은 '공유'다.
--   → SELECT은 워크스페이스 멤버 전원 열람(본인 제한 없음). "작성/수정/업로드/공유" 요구의 공유.
--   → 작성은 본인 명의, 수정은 작성자(+관리자), 삭제는 작성자 본인.
-- 첨부(attachment_*)는 files 버킷에 업로더 폴더로 올리되, 교차 다운로드는
--   서버 라우트가 admin 클라이언트로 서명 URL을 발급한다(files 스토리지 정책은 본인 폴더 한정이라).
-- 헬퍼(auth_user_workspace_ids/is_workspace_member: 033, auth_is_admin: 045)는 이미 존재 → 호출만.
-- 멱등(create table if not exists / drop policy if exists).

create table if not exists public.meeting_notes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  title           text not null default '',
  content         text not null default '',
  meeting_date    date,
  attendees       text,
  attachment_path text,
  attachment_name text,
  attachment_size bigint,
  workspace_id    uuid not null default '00000000-0000-0000-0000-0000000000e1',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_meeting_notes_ws on public.meeting_notes (workspace_id, created_at desc);
alter table public.meeting_notes enable row level security;

-- SELECT: 워크스페이스 멤버 전원 열람(공유) — 045의 '본인 OR 관리자' 제한 없음.
drop policy if exists "mn_select" on public.meeting_notes;
create policy "mn_select" on public.meeting_notes for select using (
  workspace_id in (select public.auth_user_workspace_ids())
);

-- INSERT: 본인 명의 + 워크스페이스 멤버(쓰기 강제).
drop policy if exists "mn_insert" on public.meeting_notes;
create policy "mn_insert" on public.meeting_notes for insert with check (
  (select auth.uid()) = user_id and public.is_workspace_member(workspace_id)
);

-- UPDATE: 작성자 또는 관리자. with check로 workspace_id/user_id 변조 방어(045 대비 강화).
drop policy if exists "mn_update" on public.meeting_notes;
create policy "mn_update" on public.meeting_notes for update using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = user_id or public.auth_is_admin())
) with check (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = user_id or public.auth_is_admin())
);

-- DELETE: 작성자 본인(워크스페이스 격리).
drop policy if exists "mn_delete" on public.meeting_notes;
create policy "mn_delete" on public.meeting_notes for delete using (
  (select auth.uid()) = user_id and workspace_id in (select public.auth_user_workspace_ids())
);
