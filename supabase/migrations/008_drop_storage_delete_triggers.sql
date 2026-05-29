-- 008: storage.objects 직접 DELETE 트리거 제거
--
-- 배경: 006에서 finance_entries / direct_messages 삭제 시 첨부파일을
-- `delete from storage.objects ...` 로 정리하는 BEFORE DELETE 트리거를 추가했으나,
-- Supabase가 storage 테이블에 대한 직접 DELETE 를 차단함
--   ("Direct deletion from storage tables is not allowed. Use the Storage API instead.")
-- → 이 트리거 때문에 비용·매출(및 첨부 메시지) 행 삭제 자체가 실패함.
--
-- 해결: 트리거/함수 제거. 첨부파일 정리는 클라이언트에서 Storage API
-- (supabase.storage.from(bucket).remove([...])) 로 best-effort 처리한다.

drop trigger if exists before_delete_finance_entries on public.finance_entries;
drop function if exists public.cleanup_finance_storage();

drop trigger if exists before_delete_direct_messages on public.direct_messages;
drop function if exists public.cleanup_chat_attachment();

-- 공유 재무 원장: 모든 직원이 조회(이미 허용)뿐 아니라 수정/삭제도 가능하도록 완화.
-- (기존: auth.uid() = created_by → 작성자만 가능해, OCR 등 타인이 만든 항목 삭제 불가)
drop policy if exists fin_update on public.finance_entries;
drop policy if exists fin_delete on public.finance_entries;
create policy fin_update on public.finance_entries for update using (auth.uid() is not null);
create policy fin_delete on public.finance_entries for delete using (auth.uid() is not null);
