-- ============================================================
-- (1) 항목 삭제 시 Storage 원본 파일 cascade 삭제
-- DB 어디서 삭제되든(직접 SQL, API, 클라이언트) 자동으로 정리됨
-- ============================================================

create or replace function public.cleanup_finance_storage()
returns trigger as $$
begin
  if old.receipt_url is not null then
    delete from storage.objects
      where bucket_id = 'receipts' and name = old.receipt_url;
  end if;
  return old;
end;
$$ language plpgsql security definer;

create trigger before_delete_finance_entries
  before delete on public.finance_entries
  for each row execute procedure public.cleanup_finance_storage();

create or replace function public.cleanup_card_storage()
returns trigger as $$
begin
  if old.image_url is not null then
    delete from storage.objects
      where bucket_id = 'business-cards' and name = old.image_url;
  end if;
  return old;
end;
$$ language plpgsql security definer;

create trigger before_delete_business_cards
  before delete on public.business_cards
  for each row execute procedure public.cleanup_card_storage();

create or replace function public.cleanup_chat_attachment()
returns trigger as $$
begin
  if old.attachment_url is not null then
    delete from storage.objects
      where bucket_id = 'chat-files' and name = old.attachment_url;
  end if;
  return old;
end;
$$ language plpgsql security definer;

create trigger before_delete_direct_messages
  before delete on public.direct_messages
  for each row execute procedure public.cleanup_chat_attachment();

-- ============================================================
-- (2) 알림 자동 정리: 30일 지난 '읽음' 알림 삭제 (매일 새벽 4시 KST)
-- ============================================================
create extension if not exists pg_cron;

select cron.schedule(
  'cleanup-read-notifications',
  '0 19 * * *',  -- 19:00 UTC = 04:00 KST
  $$ delete from public.notifications
       where is_read = true and created_at < now() - interval '30 days' $$
);
