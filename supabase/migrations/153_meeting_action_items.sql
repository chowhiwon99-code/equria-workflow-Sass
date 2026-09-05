-- 153: 회의 액션아이템 — 회의노트 대개편 P3 (계획: fluffy-cooking-nest)
--
-- 지금까지 액션아이템은 AI가 뽑아준 **죽은 텍스트**였다(본문 문자열로만 남고 할 일로 못 감).
-- 랜딩은 이미 "액션아이템은 프로젝트에 넣을게요"를 광고 중이라 기대-현실 갭이 컸다.
--
-- 🔴 왜 personal_tasks에 바로 넣지 않는가: personal_tasks RLS가 `auth.uid() = user_id`라
--    **타인에게 할 일을 만들어 줄 수 없다**(092). 그래서 흐름을 이렇게 잡는다:
--      회의에서 추출 → meeting_action_items(팀 공유) 저장 → 담당자에게 알림 →
--      담당자가 "내 할 일로 가져오기"(본인 명의 insert라 RLS 통과) → personal_task_id 역기록.
--    프로젝트가 연결된 회의는 project_tasks로 바로 보낼 수 있다(094 RLS = 멤버 전원 insert 허용).
--
-- 완료 상태의 SSOT는 **task 쪽**이다. status는 open|converted|dismissed만 — 이중 상태 동기화를
-- 만들지 않기 위해(완료 여부는 personal_tasks.done / project_tasks.done을 조인해 본다).
--
-- 롤백:
--   drop trigger if exists mai_notify_assignee on public.meeting_action_items;
--   drop function if exists public.notify_action_item_assignee();
--   drop trigger if exists meeting_action_items_plan_gate on public.meeting_action_items;
--   drop table if exists public.meeting_action_items;
--   -- notifications type CHECK은 되돌리지 않아도 무해(값만 추가).

create table if not exists public.meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  note_id uuid not null references public.meeting_notes(id) on delete cascade,
  title text not null,
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  status text not null default 'open' check (status in ('open', 'converted', 'dismissed')),
  personal_task_id uuid references public.personal_tasks(id) on delete set null,
  project_task_id uuid references public.project_tasks(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mai_note on public.meeting_action_items (note_id, status);
create index if not exists idx_mai_assignee on public.meeting_action_items (workspace_id, assignee_id, status);

alter table public.meeting_action_items enable row level security;

-- 협업 체크리스트 성격 — 워크스페이스 멤버 전원 CRUD(project_tasks 패턴과 동일 철학).
drop policy if exists "mai_select" on public.meeting_action_items;
create policy "mai_select" on public.meeting_action_items for select using (
  workspace_id in (select public.auth_user_workspace_ids())
);

drop policy if exists "mai_insert" on public.meeting_action_items;
create policy "mai_insert" on public.meeting_action_items for insert with check (
  public.is_workspace_member(workspace_id)
);

drop policy if exists "mai_update" on public.meeting_action_items;
create policy "mai_update" on public.meeting_action_items for update using (
  workspace_id in (select public.auth_user_workspace_ids())
) with check (
  workspace_id in (select public.auth_user_workspace_ids())
);

drop policy if exists "mai_delete" on public.meeting_action_items;
create policy "mai_delete" on public.meeting_action_items for delete using (
  workspace_id in (select public.auth_user_workspace_ids())
);

-- 회의노트와 같은 Standard+ 게이트(143 함수 재사용).
drop trigger if exists meeting_action_items_plan_gate on public.meeting_action_items;
create trigger meeting_action_items_plan_gate
  before insert on public.meeting_action_items
  for each row execute function public.enforce_plan_feature_gate('standard', '회의 액션아이템은 Standard 플랜부터 사용할 수 있어요.');

-- 알림 타입에 action_item 추가.
-- ⚠️ **현재 정의 전체를 다시 나열**한다 — 053의 목록만 베끼면 그 뒤에 추가된 approval·group·
--    workflow·billing이 빠져 기존 행이 제약을 위반한다(실제로 적용 중 한 번 실패해서 고친 것).
--    앞으로 이 CHECK을 건드릴 땐 pg_get_constraintdef로 현재 정의를 먼저 읽을 것.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['dm','event_done','event_invite','project_assigned','mail','system','announcement','approval','group','workflow','billing','action_item']));

-- 타인에게 할당하면 벨 알림 — 담당자가 대시보드에서 "내 할 일로 가져오기"를 누를 수 있게 유도.
create or replace function public.notify_action_item_assignee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_id is not null and new.assignee_id <> coalesce(new.created_by, '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into public.notifications (user_id, type, title, body, link, workspace_id)
    values (
      new.assignee_id,
      'action_item',
      '회의에서 할 일이 생겼어요',
      left(new.title, 120) || case when new.due_date is not null then ' · ~' || to_char(new.due_date, 'MM/DD') else '' end,
      '/meetings?note=' || new.note_id::text,
      new.workspace_id
    );
  end if;
  return new;
end
$$;

drop trigger if exists mai_notify_assignee on public.meeting_action_items;
create trigger mai_notify_assignee
  after insert on public.meeting_action_items
  for each row execute function public.notify_action_item_assignee();
