-- 060: 반려된 문서 재작성(재상신) — revise_document RPC.
--
-- 반려(status='반려')는 종료 상태라 ad_update RLS(임시저장만 수정)로 클라가 못 고친다.
-- 회수(recall_document)와 같은 패턴으로, 기안자가 반려 문서를 '임시저장'으로 되돌려
-- 내용·결재선을 수정한 뒤 다시 상신할 수 있게 한다. 결재선 도장은 처음부터 다시 찍도록 초기화.
-- 멱등(create or replace).

create or replace function public.revise_document(doc_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d public.approval_documents%rowtype;
begin
  if uid is null then raise exception 'unauthorized'; end if;
  select * into d from public.approval_documents where id = doc_id for update;
  if d.id is null then raise exception 'not found'; end if;
  if d.drafter_id <> uid then raise exception 'not drafter'; end if;
  if d.status <> '반려' then raise exception 'not rejected'; end if;

  -- 문서를 임시저장으로(채번·제출·완료 초기화 → 재상신 시 새 doc_no 부여)
  update public.approval_documents
    set status = '임시저장', current_step = 0, doc_no = null, submitted_at = null, completed_at = null, updated_at = now()
    where id = doc_id;

  -- 같은 결재선을 처음부터 다시 — 도장(상태·의견·시각) 초기화
  update public.approval_steps
    set status = '대기', comment = null, acted_at = null
    where document_id = doc_id;
end
$$;
grant execute on function public.revise_document(uuid) to authenticated;
