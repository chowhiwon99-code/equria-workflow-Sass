-- 011_soft_delete_trash.sql
-- 휴지통(soft-delete) 도입: 사용자 데이터는 하드삭제 대신 deleted_at 마킹.
-- 효과: ① 실수 복구/Undo 정합 ② Storage 고아파일 문제를 "행 보존"으로 회피
--       ③ storage.objects 직접 DELETE 트리거 차단 문제 원천 제거.
-- 대상: finance_entries, business_cards (현재 삭제 UI + Storage 파일 보유).
--       direct_messages는 삭제 UI가 생기는 트랙4-A에서 동일 패턴으로 추가.

-- 1) soft-delete 컬럼 (nullable 추가 — 기존 행/코드 안전)
alter table public.finance_entries add column if not exists deleted_at timestamptz;
alter table public.business_cards   add column if not exists deleted_at timestamptz;

-- 2) 1-B 버그 수정: 명함 하드삭제 트리거가 storage.objects 직접 DELETE → Supabase 차단 →
--    삭제 트랜잭션 전체 실패. soft-delete 전환으로 하드삭제 자체가 사라지므로 트리거/함수 제거.
drop trigger if exists before_delete_business_cards on public.business_cards;
drop function if exists public.cleanup_card_storage();

-- 3) 활성행 조회용 부분 인덱스 (deleted_at is null 필터 + 기존 정렬키)
create index if not exists idx_finance_entries_active
  on public.finance_entries (entry_date desc) where deleted_at is null;
create index if not exists idx_business_cards_active
  on public.business_cards (created_at desc) where deleted_at is null;
