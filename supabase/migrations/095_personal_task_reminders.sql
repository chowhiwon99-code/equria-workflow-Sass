-- 095: 오늘 할 일 시각 알림(2차) — personal_tasks(092)의 기한(due_date) 도래 시 pg_cron이 매일 아침 알림 생성.
-- 세션30에서 1차(위젯 저장·체크)와 분리해 보류했던 "시각 알림"을 추가형으로 붙인다.
-- 안전성: 전부 추가(컬럼·함수·트리거·크론잡). 파괴 없음. notifications는 이미 realtime 등록(057) → 기존 NotificationBell이 실시간 표시.
-- pg_cron/cron.schedule 패턴은 006(읽음 알림 30일 정리)에서 검증된 것을 재사용.

-- (1) 알림 발송 여부 추적 컬럼(중복 알림 방지). nullable → 기존 행 무영향.
alter table public.personal_tasks
  add column if not exists reminded_at timestamptz;

comment on column public.personal_tasks.reminded_at is '기한 알림을 보낸 시각(중복 방지). due_date 변경 시 트리거가 null로 리셋 → 재알림.';

-- (2) 기한이 바뀌면 알림 플래그 리셋 → 일정을 미루면 새 기한에 다시 알림.
--     본인 UPDATE만 이 테이블을 바꾸므로(092 RLS) 별도 인가 불필요. remind 함수의 reminded_at=now() 업데이트는
--     due_date를 안 바꾸므로(is distinct from=false) 이 트리거의 영향을 받지 않는다.
create or replace function public.reset_personal_task_reminder()
returns trigger
language plpgsql
as $$
begin
  if new.due_date is distinct from old.due_date then
    new.reminded_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_personal_task_reminder on public.personal_tasks;
create trigger trg_reset_personal_task_reminder
  before update on public.personal_tasks
  for each row execute function public.reset_personal_task_reminder();

-- (3) 기한 도래(오늘 이하) & 미완료 & 미알림 → notifications 삽입 + reminded_at 마킹.
--     security definer(소유자=postgres) → notifications RLS(auth.uid() 기반) 우회해 시스템 알림 생성 가능.
--     KST 기준 "오늘"으로 판정(서버 UTC라 timezone 변환 필수). type='system'(002 체크 제약 허용값).
create or replace function public.remind_due_personal_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today_kst date := (now() at time zone 'Asia/Seoul')::date;
  affected  integer;
begin
  with due as (
    select id, user_id, title, due_date
    from public.personal_tasks
    where done = false
      and reminded_at is null
      and due_date is not null
      and due_date <= today_kst
  ),
  ins as (
    insert into public.notifications (user_id, type, title, body, link, metadata)
    select
      d.user_id,
      'system',
      case when d.due_date < today_kst then '지난 할 일이 있어요' else '오늘 마감할 일이 있어요' end,
      d.title,
      '/dashboard',
      jsonb_build_object('kind', 'personal_task_due', 'task_id', d.id, 'due_date', d.due_date)
    from due d
    returning 1
  )
  update public.personal_tasks t
    set reminded_at = now()
    from due d
    where t.id = d.id;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on function public.remind_due_personal_tasks is '기한 도래한 개인 할 일에 대해 하루 1회 알림 생성(중복 방지). pg_cron 매일 09:00 KST 실행.';

-- (4) 매일 09:00 KST(=00:00 UTC) 실행. 잡 이름 동일 → 재실행 시 upsert(멱등).
create extension if not exists pg_cron;

select cron.schedule(
  'remind-due-personal-tasks',
  '0 0 * * *',  -- 00:00 UTC = 09:00 KST (아침 알림)
  $$ select public.remind_due_personal_tasks() $$
);
