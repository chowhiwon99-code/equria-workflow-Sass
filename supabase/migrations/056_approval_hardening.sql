-- 056: 전자결재 보강(적대 리뷰 반영).
--  ① self-approval 차단(기안자=결재자 금지) — insert·submit·act 3중 방어
--  ② doc_no 워크스페이스 유니크(중복 채번 fail-fast)
--  ③ realtime publication 등록(ApprovalView 구독 동작)
--  ④ 초안 프라이버시(임시저장은 기안자/admin만 참여자)
--  ⑤ 참조자 완료 알림
--  ⑥ 회수 → 임시저장(편집·재상신 가능)

-- ② doc_no 유니크(부분 인덱스)
create unique index if not exists uq_approval_doc_no on public.approval_documents (workspace_id, doc_no) where doc_no is not null;

-- ③ realtime
do $$ begin alter publication supabase_realtime add table public.approval_documents; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.approval_steps; exception when duplicate_object then null; end $$;

-- ④ 초안 프라이버시 — 임시저장 문서는 기안자/admin만(결재자 추가돼도 상신 전엔 비공개)
create or replace function public.is_approval_participant(doc_id uuid)
returns boolean language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.approval_documents d
    where d.id = doc_id
      and ( d.drafter_id = (select auth.uid())
            or public.auth_is_admin()
            or ( d.status <> '임시저장'
                 and exists (select 1 from public.approval_steps s
                             where s.document_id = d.id and s.approver_id = (select auth.uid())) ) )
  )
$$;

-- ① self-approval — 임시저장 단계 insert부터 결재(role='결재')에 기안자 본인 금지
drop policy if exists "as_insert" on public.approval_steps;
create policy "as_insert" on public.approval_steps for insert with check (
  public.is_workspace_member(workspace_id)
  and exists (select 1 from public.approval_documents d
              where d.id = document_id and d.drafter_id = (select auth.uid()) and d.status = '임시저장')
  and not (role = '결재' and exists (select 1 from public.approval_documents d where d.id = document_id and d.drafter_id = approver_id))
);

-- 상신: self-approval 거부(이중 방어) + 채번/알림(054와 동일, self 검증만 추가)
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
  if exists (select 1 from public.approval_steps where document_id = doc_id and role = '결재' and approver_id = d.drafter_id) then
    raise exception 'self approval not allowed';
  end if;

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

-- 결재: self-approval 방어 + 승인완료 시 참조자 알림
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

  select * into cur from public.approval_steps
    where document_id = p_document_id and role = '결재'
    order by step_order offset (d.current_step - 1) limit 1;
  if cur.id is null or cur.approver_id <> uid or cur.status <> '대기' then
    raise exception 'not your turn';
  end if;
  if cur.approver_id = d.drafter_id then raise exception 'self approval not allowed'; end if;

  if p_action = '반려' then
    if coalesce(trim(p_comment), '') = '' then raise exception 'comment required'; end if;
    update public.approval_steps set status = '반려', comment = p_comment, acted_at = now() where id = cur.id;
    update public.approval_documents set status = '반려', completed_at = now(), updated_at = now() where id = p_document_id;
    insert into public.notifications (user_id, type, title, body, link, workspace_id)
    values (d.drafter_id, 'approval', '⛔ 반려됨: ' || coalesce(nullif(d.title,''),'(제목 없음)'),
            coalesce(d.doc_no,''), '/approval/' || p_document_id::text, d.workspace_id);
    return;
  end if;

  update public.approval_steps set status = '승인', comment = p_comment, acted_at = now() where id = cur.id;
  select count(*) into remaining from public.approval_steps
    where document_id = p_document_id and role = '결재' and status = '대기';
  if remaining = 0 then
    update public.approval_documents set status = '승인완료', completed_at = now(), updated_at = now() where id = p_document_id;
    insert into public.notifications (user_id, type, title, body, link, workspace_id)
    values (d.drafter_id, 'approval', '✅ 승인됨: ' || coalesce(nullif(d.title,''),'(제목 없음)'),
            coalesce(d.doc_no,''), '/approval/' || p_document_id::text, d.workspace_id);
    -- 참조자 완료 알림
    insert into public.notifications (user_id, type, title, body, link, workspace_id)
    select s.approver_id, 'approval', '📄 결재 완료: ' || coalesce(nullif(d.title,''),'(제목 없음)'),
           coalesce(d.doc_no,''), '/approval/' || p_document_id::text, d.workspace_id
    from public.approval_steps s where s.document_id = p_document_id and s.role = '참조' and s.approver_id <> d.drafter_id;
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

-- 회수: 진행중·결재 전이면 임시저장으로 되돌림(편집·재상신 가능). doc_no/submitted 초기화.
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
  update public.approval_documents
    set status = '임시저장', current_step = 0, doc_no = null, submitted_at = null, updated_at = now()
    where id = doc_id;
end
$$;
