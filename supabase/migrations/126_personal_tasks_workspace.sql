-- 126: 오늘 할 일 회사별 분리(세션41 대표 요청 — 이큐리아/이큐리아2 겹침 해소)
-- personal_tasks에 workspace_id 추가(추가형). RLS는 그대로 '본인 것만'(개인 자원) — workspace_id는 활성 회사별 필터 차원.
-- 기존 할 일은 이큐리아(첫 회사·sentinel)에 귀속. 앱은 항상 활성 워크스페이스로 필터/삽입.
-- 롤백: alter table public.personal_tasks drop column if exists workspace_id;

alter table public.personal_tasks
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- 기존 행은 이큐리아(sentinel)로 귀속 — null이면 어느 워크스페이스에도 안 보이므로 백필 필수.
update public.personal_tasks
  set workspace_id = '00000000-0000-0000-0000-0000000000e1'
  where workspace_id is null;

create index if not exists idx_personal_tasks_ws_user on public.personal_tasks (workspace_id, user_id, done, sort_order);
