-- ============================================================
-- EQURIA Workspace — 신규 기능 스키마 (Phase A)
-- 파일: supabase/migrations/002_features.sql
-- 추가 기능: 프로젝트 관리 / 알림 / 비용·매출 / 세금계산서 초안 /
--           명함 관리 / (설계만) Google 연동(파일·Gmail)
-- 참고: direct_conversations, direct_messages, calendar_events는 이미 존재.
--       여기서는 calendar_events에 컬럼만 추가하고 알림 트리거를 건다.
-- ============================================================

-- ============================================================
-- Table: projects (프로젝트)
-- ============================================================
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  status      text not null default 'planned'
                check (status in ('planned','in_progress','on_hold','done','canceled')),
  owner_id    uuid references public.profiles(id) on delete set null,  -- 담당자(PM)
  start_date  date,
  due_date    date,
  metadata    jsonb not null default '{}',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.projects is '팀 프로젝트 — 상태/담당자/일정 관리';

-- ============================================================
-- Table: project_members (프로젝트 참여자)
-- ============================================================
create table public.project_members (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);

-- ============================================================
-- Table: notifications (알림)
-- ============================================================
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,  -- 받는 사람
  type       text not null
               check (type in ('dm','event_done','event_invite','project_assigned','mail','system')),
  title      text not null,
  body       text,
  link       text,                 -- 클릭 시 이동 경로 (예: /chat/<id>)
  is_read    boolean not null default false,
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now()
);

comment on table public.notifications is '사용자별 알림 (DM/일정완료/프로젝트배정/메일 등)';

-- ============================================================
-- Table: finance_entries (비용·매출 항목)
-- ============================================================
create table public.finance_entries (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('expense','revenue')),  -- 비용/매출
  entry_date   date not null,
  vendor       text,             -- 거래처(영수증 상호)
  description  text,
  amount       numeric(14,2) not null default 0,   -- 공급가액
  tax_amount   numeric(14,2) not null default 0,   -- 부가세
  total_amount numeric(14,2) not null default 0,   -- 합계
  category     text,             -- 식비/교통/소프트웨어 등 분류
  project_id   uuid references public.projects(id) on delete set null,
  receipt_url  text,             -- Storage 영수증 이미지 경로
  source       text not null default 'manual' check (source in ('manual','ocr')),
  status       text not null default 'draft' check (status in ('draft','confirmed')),
  metadata     jsonb not null default '{}',     -- OCR 원본 JSON 보관
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.finance_entries is '비용/매출 정리표 — 영수증 OCR 자동입력 지원';

-- ============================================================
-- Table: tax_invoices (세금계산서 초안 — 작성·정리만, 실발행 안 함)
-- ============================================================
create table public.tax_invoices (
  id              uuid primary key default gen_random_uuid(),
  direction       text not null check (direction in ('sales','purchase')),  -- 매출/매입
  supplier_name   text,
  supplier_biz_no text,
  buyer_name      text,
  buyer_biz_no    text,
  issue_date      date,
  supply_amount   numeric(14,2) not null default 0,
  tax_amount      numeric(14,2) not null default 0,
  total_amount    numeric(14,2) not null default 0,
  items           jsonb not null default '[]',     -- 품목 배열
  status          text not null default 'draft' check (status in ('draft','ready')),
  source_entry_id uuid references public.finance_entries(id) on delete set null,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.tax_invoices is '세금계산서 초안 (작성·정리 전용, 전자발행 미포함)';

-- ============================================================
-- Table: business_cards (명함 관리)
-- ============================================================
create table public.business_cards (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,  -- 등록한 직원
  name        text,
  company     text,
  title       text,            -- 직책
  department  text,
  phone       text,
  mobile      text,
  email       text,
  address     text,
  website     text,
  image_url   text,            -- Storage 명함 사진
  raw_ocr     jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.business_cards is '명함 관리 — 사진 OCR 자동 등록';

-- ============================================================
-- Table: google_connections (Google OAuth 토큰 — 설계만, 구현은 나중)
-- ============================================================
create table public.google_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  google_email  text,
  access_token  text,            -- 추후 OAuth 시 채움
  refresh_token text,
  scopes        text[] not null default '{}',
  expires_at    timestamptz,
  is_active     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(user_id)
);

comment on table public.google_connections is '직원별 Google 계정 연동 토큰 (Phase F, 구현 예정)';

-- ============================================================
-- Table: files (Drive 파일 메타 캐시 — 설계만)
-- ============================================================
create table public.files (
  id            uuid primary key default gen_random_uuid(),
  source        text not null default 'gdrive' check (source in ('gdrive','local')),
  external_id   text,            -- Google Drive file id
  name          text not null,
  mime_type     text,
  size_bytes    bigint,
  web_view_link text,
  project_id    uuid references public.projects(id) on delete set null,
  owner_id      uuid references public.profiles(id) on delete set null,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

comment on table public.files is 'Google Drive 파일 메타 캐시 (Phase F, 구현 예정)';

-- ============================================================
-- 기존 calendar_events 확장 (일정 완료 상태 + 프로젝트 연결)
-- ============================================================
alter table public.calendar_events
  add column if not exists status text not null default 'scheduled'
    check (status in ('scheduled','done','canceled'));
alter table public.calendar_events
  add column if not exists project_id uuid references public.projects(id) on delete set null;

-- ============================================================
-- 알림 자동생성 트리거 (security definer → RLS 우회)
-- ============================================================

-- DM 수신 → 상대방에게 알림
create or replace function public.handle_new_dm()
returns trigger as $$
declare
  recipient uuid;
  conv      record;
begin
  select * into conv from public.direct_conversations where id = new.conversation_id;
  recipient := case when conv.user_a = new.sender_id then conv.user_b else conv.user_a end;
  insert into public.notifications (user_id, type, title, body, link, metadata)
  values (recipient, 'dm', '새 메시지', left(new.content, 50),
          '/chat/' || new.sender_id, jsonb_build_object('message_id', new.id));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_new_dm
  after insert on public.direct_messages
  for each row execute procedure public.handle_new_dm();

-- 일정 완료 → 참석자 전원에게 알림
create or replace function public.handle_event_done()
returns trigger as $$
declare
  attendee uuid;
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    foreach attendee in array new.attendees loop
      insert into public.notifications (user_id, type, title, body, link, metadata)
      values (attendee, 'event_done', '일정 완료', new.title,
              '/calendar', jsonb_build_object('event_id', new.id));
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_event_done
  after update of status on public.calendar_events
  for each row execute procedure public.handle_event_done();

-- 프로젝트 멤버 배정 → 해당 멤버에게 알림
create or replace function public.handle_project_assigned()
returns trigger as $$
declare
  proj record;
begin
  select * into proj from public.projects where id = new.project_id;
  insert into public.notifications (user_id, type, title, body, link, metadata)
  values (new.user_id, 'project_assigned', '프로젝트 배정', proj.name,
          '/projects/' || new.project_id, jsonb_build_object('project_id', new.project_id));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_project_assigned
  after insert on public.project_members
  for each row execute procedure public.handle_project_assigned();

-- ============================================================
-- RLS 정책
-- ============================================================
alter table public.projects          enable row level security;
alter table public.project_members   enable row level security;
alter table public.notifications     enable row level security;
alter table public.finance_entries   enable row level security;
alter table public.tax_invoices      enable row level security;
alter table public.business_cards    enable row level security;
alter table public.google_connections enable row level security;
alter table public.files             enable row level security;

-- projects (사내 전직원 조회, 작성자/담당자 수정)
create policy "projects_select" on public.projects for select using (auth.uid() is not null);
create policy "projects_insert" on public.projects for insert with check (auth.uid() is not null);
create policy "projects_update" on public.projects for update
  using (auth.uid() = created_by or auth.uid() = owner_id);
create policy "projects_delete" on public.projects for delete using (auth.uid() = created_by);

-- project_members (조회는 전직원, 추가/삭제는 프로젝트 작성자/담당자만)
create policy "pm_select" on public.project_members for select using (auth.uid() is not null);
create policy "pm_insert" on public.project_members for insert
  with check (exists (select 1 from public.projects p where p.id = project_id
              and (p.created_by = auth.uid() or p.owner_id = auth.uid())));
create policy "pm_delete" on public.project_members for delete
  using (exists (select 1 from public.projects p where p.id = project_id
         and (p.created_by = auth.uid() or p.owner_id = auth.uid())));

-- notifications (본인 것만)
create policy "notif_select" on public.notifications for select using (auth.uid() = user_id);
create policy "notif_insert" on public.notifications for insert with check (auth.uid() is not null);
create policy "notif_update" on public.notifications for update using (auth.uid() = user_id);

-- finance_entries (사내 전직원 조회, 작성자 수정/삭제)
create policy "fin_select" on public.finance_entries for select using (auth.uid() is not null);
create policy "fin_insert" on public.finance_entries for insert with check (auth.uid() is not null);
create policy "fin_update" on public.finance_entries for update using (auth.uid() = created_by);
create policy "fin_delete" on public.finance_entries for delete using (auth.uid() = created_by);

-- tax_invoices (사내 전직원 조회, 작성자 수정)
create policy "tax_select" on public.tax_invoices for select using (auth.uid() is not null);
create policy "tax_insert" on public.tax_invoices for insert with check (auth.uid() is not null);
create policy "tax_update" on public.tax_invoices for update using (auth.uid() = created_by);

-- business_cards (전직원 조회, 등록자만 수정/삭제)
create policy "card_select" on public.business_cards for select using (auth.uid() is not null);
create policy "card_insert" on public.business_cards for insert with check (auth.uid() = owner_id);
create policy "card_update" on public.business_cards for update using (auth.uid() = owner_id);
create policy "card_delete" on public.business_cards for delete using (auth.uid() = owner_id);

-- google_connections (본인 것만)
create policy "gc_select" on public.google_connections for select using (auth.uid() = user_id);
create policy "gc_insert" on public.google_connections for insert with check (auth.uid() = user_id);
create policy "gc_update" on public.google_connections for update using (auth.uid() = user_id);
create policy "gc_delete" on public.google_connections for delete using (auth.uid() = user_id);

-- files (전직원 조회, 소유자 수정)
create policy "files_select" on public.files for select using (auth.uid() is not null);
create policy "files_insert" on public.files for insert with check (auth.uid() is not null);
create policy "files_update" on public.files for update using (auth.uid() = owner_id);
create policy "files_delete" on public.files for delete using (auth.uid() = owner_id);

-- ============================================================
-- 인덱스
-- ============================================================
create index idx_projects_status on public.projects(status, created_at desc);
create index idx_projects_owner   on public.projects(owner_id);
create index idx_pm_user          on public.project_members(user_id);
create index idx_pm_project        on public.project_members(project_id);
create index idx_notif_user        on public.notifications(user_id, created_at desc) where is_read = false;
create index idx_fin_date          on public.finance_entries(entry_date desc);
create index idx_fin_kind          on public.finance_entries(kind, entry_date desc);
create index idx_cards_owner       on public.business_cards(owner_id, created_at desc);
create index idx_cards_company     on public.business_cards(company);
create index idx_files_project     on public.files(project_id, created_at desc);

-- ============================================================
-- Storage 버킷 (영수증/명함 사진 — 비공개, 본인 폴더만 접근)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false), ('business-cards', 'business-cards', false)
on conflict (id) do nothing;

create policy "receipts_rw" on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cards_rw" on storage.objects for all to authenticated
  using (bucket_id = 'business-cards' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'business-cards' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Realtime: 알림 벨/실시간 수신용 publication 등록
-- (direct_messages는 기존에 등록됨)
-- ============================================================
alter publication supabase_realtime add table public.notifications;
