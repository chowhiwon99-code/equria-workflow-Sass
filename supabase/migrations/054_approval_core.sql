-- 054: 카카오워크식 전자결재 코어 — 문서·결재선·의견 + RPC(상신/결재/회수).
--
-- 핵심 안전장치: 상신 후 status/current_step/step 상태 변경은 전부 SECURITY DEFINER RPC로만.
-- 클라이언트는 '임시저장' 문서만 직접 수정/삭제 가능, approval_steps엔 UPDATE 정책 자체가 없음.
-- 결재는 role='결재' 단계를 step_order 순서로 순차 진행(current_step). 참조(참조)는 읽기+완료알림만.
-- 멱등(create table if not exists / drop policy if exists / create or replace).

-- ============================================================ 테이블
create table if not exists public.approval_documents (
  id              uuid primary key default gen_random_uuid(),
  doc_no          text,
  drafter_id      uuid not null references public.profiles(id) on delete cascade,
  doc_type        text not null default '일반기안' check (doc_type in ('일반기안','지출결의서','휴가신청서','근태정정','출장신청서')),
  title           text not null default '',
  body            jsonb not null default '{}',
  status          text not null default '임시저장' check (status in ('임시저장','진행중','승인완료','반려','회수')),
  current_step    int not null default 0,
  submitted_at    timestamptz,
  completed_at    timestamptz,
  attachment_path text,
  attachment_name text,
  attachment_size bigint,
  workspace_id    uuid not null default '00000000-0000-0000-0000-0000000000e1',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_approval_docs_ws on public.approval_documents (workspace_id, status, created_at desc);
create index if not exists idx_approval_docs_drafter on public.approval_documents (drafter_id, created_at desc);

create table if not exists public.approval_steps (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.approval_documents(id) on delete cascade,
  step_order   int not null,
  approver_id  uuid not null references public.profiles(id) on delete cascade,
  role         text not null default '결재' check (role in ('결재','참조')),
  status       text not null default '대기' check (status in ('대기','승인','반려')),
  comment      text,
  acted_at     timestamptz,
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1',
  created_at   timestamptz not null default now(),
  unique (document_id, step_order, approver_id)
);
create index if not exists idx_approval_steps_doc on public.approval_steps (document_id, step_order);
create index if not exists idx_approval_steps_approver on public.approval_steps (approver_id, status);

create table if not exists public.approval_comments (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.approval_documents(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  body         text not null,
  workspace_id uuid not null default '00000000-0000-0000-0000-0000000000e1',
  created_at   timestamptz not null default now()
);
create index if not exists idx_approval_comments_doc on public.approval_comments (document_id, created_at);

-- ============================================================ 참여자 헬퍼
create or replace function public.is_approval_participant(doc_id uuid)
returns boolean language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.approval_documents d
    where d.id = doc_id
      and ( d.drafter_id = (select auth.uid())
            or public.auth_is_admin()
            or exists (select 1 from public.approval_steps s
                       where s.document_id = d.id and s.approver_id = (select auth.uid())) )
  )
$$;
grant execute on function public.is_approval_participant(uuid) to authenticated;

-- ============================================================ RLS
alter table public.approval_documents enable row level security;
alter table public.approval_steps enable row level security;
alter table public.approval_comments enable row level security;

-- documents: 참여자만 열람 / 본인 기안 생성 / 임시저장만 수정·삭제(이후는 RPC)
drop policy if exists "ad_select" on public.approval_documents;
create policy "ad_select" on public.approval_documents for select using (
  workspace_id in (select public.auth_user_workspace_ids()) and public.is_approval_participant(id)
);
drop policy if exists "ad_insert" on public.approval_documents;
create policy "ad_insert" on public.approval_documents for insert with check (
  (select auth.uid()) = drafter_id and public.is_workspace_member(workspace_id)
);
drop policy if exists "ad_update" on public.approval_documents;
create policy "ad_update" on public.approval_documents for update using (
  (select auth.uid()) = drafter_id and status = '임시저장'
) with check (
  (select auth.uid()) = drafter_id and status = '임시저장'
);
drop policy if exists "ad_delete" on public.approval_documents;
create policy "ad_delete" on public.approval_documents for delete using (
  (select auth.uid()) = drafter_id and status = '임시저장' and workspace_id in (select public.auth_user_workspace_ids())
);

-- steps: 참여자 열람 / 작성중(임시저장)에만 기안자가 구성(insert·delete) / UPDATE 정책 없음(전부 RPC)
drop policy if exists "as_select" on public.approval_steps;
create policy "as_select" on public.approval_steps for select using (
  workspace_id in (select public.auth_user_workspace_ids()) and public.is_approval_participant(document_id)
);
drop policy if exists "as_insert" on public.approval_steps;
create policy "as_insert" on public.approval_steps for insert with check (
  public.is_workspace_member(workspace_id)
  and exists (select 1 from public.approval_documents d
              where d.id = document_id and d.drafter_id = (select auth.uid()) and d.status = '임시저장')
);
drop policy if exists "as_delete" on public.approval_steps;
create policy "as_delete" on public.approval_steps for delete using (
  exists (select 1 from public.approval_documents d
          where d.id = document_id and d.drafter_id = (select auth.uid()) and d.status = '임시저장')
);

-- comments: 참여자 열람 / 본인 작성 / 본인 삭제
drop policy if exists "ac_select" on public.approval_comments;
create policy "ac_select" on public.approval_comments for select using (
  workspace_id in (select public.auth_user_workspace_ids()) and public.is_approval_participant(document_id)
);
drop policy if exists "ac_insert" on public.approval_comments;
create policy "ac_insert" on public.approval_comments for insert with check (
  (select auth.uid()) = user_id and public.is_workspace_member(workspace_id) and public.is_approval_participant(document_id)
);
drop policy if exists "ac_delete" on public.approval_comments;
create policy "ac_delete" on public.approval_comments for delete using (
  (select auth.uid()) = user_id
);

-- ============================================================ RPC (009 mark_dm_read 패턴)
-- 상신: 임시저장→진행중, 문서번호 부여, 1차 결재자 알림.
create or replace function public.submit_document(doc_id uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d public.approval_documents%rowtype;
  step_cnt int;
  seq int;
  newno text;
  first_approver uuid;
begin
  if uid is null then raise exception 'unauthorized'; end if;
  select * into d from public.approval_documents where id = doc_id for update;
  if d.id is null then raise exception 'not found'; end if;
  if d.drafter_id <> uid then raise exception 'not drafter'; end if;
  if d.status <> '임시저장' then raise exception 'not draft'; end if;
  select count(*) into step_cnt from public.approval_steps where document_id = doc_id and role = '결재';
  if step_cnt < 1 then raise exception 'no approver'; end if;

  select count(*) + 1 into seq from public.approval_documents
    where workspace_id = d.workspace_id and doc_no is not null
      and extract(year from submitted_at) = extract(year from now());
  newno := 'EQ-' || extract(year from now())::int || '-' || lpad(seq::text, 4, '0');

  update public.approval_documents
    set status = '진행중', current_step = 1, doc_no = newno, submitted_at = now(), updated_at = now()
    where id = doc_id;

  select approver_id into first_approver from public.approval_steps
    where document_id = doc_id and role = '결재' order by step_order limit 1;
  if first_approver is not null and first_approver <> uid then
    insert into public.notifications (user_id, type, title, body, link, workspace_id)
    values (first_approver, 'approval', '🖋 결재 요청: ' || coalesce(nullif(d.title,''),'(제목 없음)'),
            newno, '/approval/' || doc_id::text, d.workspace_id);
  end if;
  return newno;
end
$$;
grant execute on function public.submit_document(uuid) to authenticated;

-- 결재: 현재 단계 결재자만 승인/반려(반려=의견 필수). 마지막이면 완료, 아니면 다음 단계로.
create or replace function public.act_on_approval(p_document_id uuid, p_action text, p_comment text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d public.approval_documents%rowtype;
  cur public.approval_steps%rowtype;
  remaining int;
  nxt uuid;
begin
  if uid is null then raise exception 'unauthorized'; end if;
  if p_action not in ('승인','반려') then raise exception 'bad action'; end if;
  select * into d from public.approval_documents where id = p_document_id for update;
  if d.id is null then raise exception 'not found'; end if;
  if d.status <> '진행중' then raise exception 'not in progress'; end if;

  -- 현재 결재 단계 = role='결재' 정렬에서 (current_step)번째
  select * into cur from public.approval_steps
    where document_id = p_document_id and role = '결재'
    order by step_order offset (d.current_step - 1) limit 1;
  if cur.id is null or cur.approver_id <> uid or cur.status <> '대기' then
    raise exception 'not your turn';
  end if;

  if p_action = '반려' then
    if coalesce(trim(p_comment), '') = '' then raise exception 'comment required'; end if;
    update public.approval_steps set status = '반려', comment = p_comment, acted_at = now() where id = cur.id;
    update public.approval_documents set status = '반려', completed_at = now(), updated_at = now() where id = p_document_id;
    insert into public.notifications (user_id, type, title, body, link, workspace_id)
    values (d.drafter_id, 'approval', '⛔ 반려됨: ' || coalesce(nullif(d.title,''),'(제목 없음)'),
            coalesce(d.doc_no,''), '/approval/' || p_document_id::text, d.workspace_id);
    return;
  end if;

  -- 승인
  update public.approval_steps set status = '승인', comment = p_comment, acted_at = now() where id = cur.id;
  select count(*) into remaining from public.approval_steps
    where document_id = p_document_id and role = '결재' and status = '대기';
  if remaining = 0 then
    update public.approval_documents set status = '승인완료', completed_at = now(), updated_at = now() where id = p_document_id;
    insert into public.notifications (user_id, type, title, body, link, workspace_id)
    values (d.drafter_id, 'approval', '✅ 승인됨: ' || coalesce(nullif(d.title,''),'(제목 없음)'),
            coalesce(d.doc_no,''), '/approval/' || p_document_id::text, d.workspace_id);
  else
    update public.approval_documents set current_step = current_step + 1, updated_at = now() where id = p_document_id;
    select approver_id into nxt from public.approval_steps
      where document_id = p_document_id and role = '결재' and status = '대기' order by step_order limit 1;
    if nxt is not null then
      insert into public.notifications (user_id, type, title, body, link, workspace_id)
      values (nxt, 'approval', '🖋 결재 요청: ' || coalesce(nullif(d.title,''),'(제목 없음)'),
              coalesce(d.doc_no,''), '/approval/' || p_document_id::text, d.workspace_id);
    end if;
  end if;
end
$$;
grant execute on function public.act_on_approval(uuid, text, text) to authenticated;

-- 회수: 기안자가 진행중이고 아직 아무도 결재하지 않았을 때만.
create or replace function public.recall_document(doc_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d public.approval_documents%rowtype;
  acted int;
begin
  if uid is null then raise exception 'unauthorized'; end if;
  select * into d from public.approval_documents where id = doc_id for update;
  if d.id is null then raise exception 'not found'; end if;
  if d.drafter_id <> uid then raise exception 'not drafter'; end if;
  if d.status <> '진행중' then raise exception 'not in progress'; end if;
  select count(*) into acted from public.approval_steps where document_id = doc_id and role = '결재' and status <> '대기';
  if acted > 0 then raise exception 'already acted'; end if;
  update public.approval_documents set status = '회수', current_step = 0, updated_at = now() where id = doc_id;
end
$$;
grant execute on function public.recall_document(uuid) to authenticated;
