-- 152: 회의록 ↔ 프로젝트·일정 연결 — 회의노트 대개편 P3 (계획: fluffy-cooking-nest)
--
-- 회의록은 지금까지 고아 엔티티였다(project_id·calendar_event_id 어느 것도 없음). 연결이 생기면
-- ① 회의 화면에서 프로젝트 상태·D-day를 바로 보고 ② 컴피·창고 질의가 "이 프로젝트 관련 회의"를
-- 묶어 답할 수 있다. 둘 다 nullable — 연결은 선택이다.
--
-- 메타(폴더·분류·중요도)와 같은 권한 분리 패턴을 따른다: 본문 편집권(작성자·admin)과 무관하게
-- **멤버 누구나** 연결을 걸 수 있다(set_meeting_note_folder(065)·set_meeting_meta(070)와 동일).
--
-- 롤백:
--   drop function if exists public.set_meeting_links(uuid, uuid, uuid);
--   alter table public.meeting_notes drop column if exists project_id, drop column if exists calendar_event_id;

alter table public.meeting_notes
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists calendar_event_id uuid references public.calendar_events(id) on delete set null;

create index if not exists idx_mn_project on public.meeting_notes (project_id) where project_id is not null;

-- 멤버 누구나 연결/해제. NULL = 연결 해제(non-STRICT 필요 — 인자 NULL을 그대로 받아야 한다).
create or replace function public.set_meeting_links(p_note uuid, p_project uuid, p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
begin
  select workspace_id into v_ws from public.meeting_notes where id = p_note;
  if v_ws is null then
    raise exception '회의록을 찾을 수 없어요.' using errcode = 'no_data_found';
  end if;
  if not public.is_workspace_member(v_ws) then
    raise exception '권한이 없어요.' using errcode = 'insufficient_privilege';
  end if;

  -- 연결 대상이 같은 워크스페이스인지 확인(교차 워크스페이스 연결 차단).
  if p_project is not null and not exists (
    select 1 from public.projects p where p.id = p_project and p.workspace_id = v_ws
  ) then
    raise exception '같은 회사의 프로젝트만 연결할 수 있어요.' using errcode = 'check_violation';
  end if;
  if p_event is not null and not exists (
    select 1 from public.calendar_events e where e.id = p_event and e.workspace_id = v_ws
  ) then
    raise exception '같은 회사의 일정만 연결할 수 있어요.' using errcode = 'check_violation';
  end if;

  update public.meeting_notes
     set project_id = p_project,
         calendar_event_id = p_event,
         updated_at = now()
   where id = p_note;
end
$$;

revoke execute on function public.set_meeting_links(uuid, uuid, uuid) from anon;
