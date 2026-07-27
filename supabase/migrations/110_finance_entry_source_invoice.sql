-- 110: 재무 SSOT 통합(세션39) — finance_entries.source에 'invoice' 허용.
-- 매출 세금계산서를 "확정·장부 기록"하면 장부에 매출 기록이 자동 생성되는데, 그 출처 표기용.
-- 추가형·멱등(제약 재생성). 롤백 = source='invoice' 기록 삭제 후 check를 ('manual','ocr')로 복원.
alter table public.finance_entries drop constraint if exists finance_entries_source_check;
alter table public.finance_entries add constraint finance_entries_source_check
  check (source in ('manual','ocr','invoice'));
comment on column public.finance_entries.source is
  'manual=직접/캔버스 기록 · ocr=영수증 자동 · invoice=매출 세금계산서 확정 시 자동 기록';
