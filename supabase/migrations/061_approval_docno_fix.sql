-- 061: 문서번호(doc_no) 채번 버그 수정 — gap 재사용 충돌 방지.
--
-- 문제: submit_document(056)이 'non-null doc_no 개수 + 1'로 채번했다. 회수(recall)·재작성(revise)이
-- 중간 번호의 doc_no를 NULL로 비우면 번호열에 빈칸이 생기고, 다음 상신 시 count+1이 이미 존재하는
-- 더 높은 번호와 겹쳐 부분 유니크 인덱스(uq_approval_doc_no) 위반(23505) → 재상신이 영구 실패.
--   예) 0001·0002·0003 존재 → 0002 재작성(NULL) → 재상신 seq=count(2)+1=3 → 'EQ-...-0003' 충돌.
--
-- 수정: 'count+1' → '최대 일련번호 + 1'(gap 재사용 안 함). + 워크스페이스·연도별 advisory lock으로
-- 동시 상신 채번을 직렬화(서로 다른 문서 동시 상신 시 같은 seq 계산 race 제거).
-- submit_document 한 곳만 고치면 일반 상신·회수 후 재상신·반려 후 재작성 모두 안전. 멱등(create or replace).

create or replace function public.submit_document(doc_id uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d public.approval_documents%rowtype;
  step_cnt int;
  yr int := extract(year from now())::int;
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

  -- 워크스페이스·연도별 채번 직렬화(동시 상신 race 방지)
  perform pg_advisory_xact_lock(hashtext('approval_doc_no:' || d.workspace_id::text || ':' || yr));
  -- 최대 일련번호 + 1 (gap 재사용 금지). doc_no = 'EQ-YYYY-NNNN' → 3번째 토큰이 일련번호.
  select coalesce(max(split_part(doc_no, '-', 3)::int), 0) + 1 into seq
    from public.approval_documents
    where workspace_id = d.workspace_id and doc_no like 'EQ-' || yr || '-%';
  newno := 'EQ-' || yr || '-' || lpad(seq::text, 4, '0');

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
