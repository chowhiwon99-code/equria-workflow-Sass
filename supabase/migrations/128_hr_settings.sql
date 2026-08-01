-- 128: 회사별 인사(HR) 설정 + 근속 연차 근거 + '월차' 사유 추가
--
-- 왜: 연차·반차·월차 부여 기준, 근무시간, 회사 휴무일은 회사마다 달라 workspace별 설정으로 둔다.
--     이 설정 위에서 근태 잔여(부여-사용)를 계산하고, 범용 비서(컴피)가 답변한다.
-- 패턴: cashflow_settings(080)형 — workspace_id PK 1행 + jsonb. 단 쓰기는 오너만(HR는 민감).
--       workspace_id sentinel 기본값 없음(마이그112 쓰기격리 이후 원칙 — upsert가 항상 명시).
-- 전부 additive·멱등. 롤백 = 파일 하단 주석.

-- ── 1) hr_settings (워크스페이스당 1행) ──
create table if not exists public.hr_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  leave_policy jsonb not null default '{}'::jsonb,   -- 연차/반차/월차 부여·기준(코드 DEFAULT_LEAVE_POLICY와 병합)
  work_policy  jsonb not null default '{}'::jsonb,   -- 표준 출퇴근·주 근무시간·유연근무
  holidays     jsonb not null default '[]'::jsonb,   -- [{date:'2026-01-01', name:'신정'}, ...] 회사 휴무/공휴일
  updated_by   uuid references public.profiles(id) on delete set null,
  updated_at   timestamptz not null default now()
);
alter table public.hr_settings enable row level security;

-- 읽기 = 워크스페이스 멤버(잔여 계산·근무정책 참조 필요), 쓰기 = 오너만(auth_is_workspace_owner)
drop policy if exists hrs_select on public.hr_settings;
create policy hrs_select on public.hr_settings for select
  using (workspace_id in (select public.auth_user_workspace_ids()));
drop policy if exists hrs_insert on public.hr_settings;
create policy hrs_insert on public.hr_settings for insert
  with check (public.auth_is_workspace_owner(workspace_id));
drop policy if exists hrs_update on public.hr_settings;
create policy hrs_update on public.hr_settings for update
  using (public.auth_is_workspace_owner(workspace_id))
  with check (public.auth_is_workspace_owner(workspace_id));
-- delete 정책 없음 = 거부(설정 행은 유지·값 비우기만). 워크스페이스 삭제는 FK cascade.

-- ── 2) profiles.hire_date (근속 기반 연차 산정 근거) ──
alter table public.profiles add column if not exists hire_date date;

-- ── 3) '월차' 사유 additive (기존 enum 값 불변) ──
alter table public.attendance_records drop constraint if exists attendance_records_status_check;
alter table public.attendance_records add constraint attendance_records_status_check
  check (status in ('정상','지각','재택','외근','출장','연차','반차','월차','결근'));

alter table public.leave_requests drop constraint if exists leave_requests_leave_type_check;
alter table public.leave_requests add constraint leave_requests_leave_type_check
  check (leave_type in ('연차','반차','월차','병가','경조사','공가','기타'));

-- ── 롤백 ──
-- drop table if exists public.hr_settings;
-- alter table public.profiles drop column if exists hire_date;
-- alter table public.attendance_records drop constraint if exists attendance_records_status_check;
-- alter table public.attendance_records add constraint attendance_records_status_check
--   check (status in ('정상','지각','재택','외근','출장','연차','반차','결근'));
-- alter table public.leave_requests drop constraint if exists leave_requests_leave_type_check;
-- alter table public.leave_requests add constraint leave_requests_leave_type_check
--   check (leave_type in ('연차','반차','병가','경조사','공가','기타'));
