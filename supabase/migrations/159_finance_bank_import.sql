-- 159: 통장 거래내역 가져오기(엑셀 업로드 → 이후 자동 연동도 같은 경로) 기반.
-- 1) source에 'bank' 허용 — 은행에서 온 기록을 수동/OCR/세금계산서와 구분(필터·감사용).
-- 2) import_fp — 거래 지문(날짜·시각·입출금·금액·잔액·적요의 해시). 같은 파일을 두 번 올려도
--    (workspace_id, import_fp) 유니크가 중복 삽입을 막는다. NULL은 서로 다르므로 기존/수동 기록엔 영향 없음.
--    지운(휴지통) 거래도 지문이 남아 재업로드로 되살아나지 않는다(의도: 지운 건 지운 것).
-- 되돌리기: drop constraint finance_entries_import_fp_key; alter table drop column import_fp;
--          source check를 ('manual','ocr','invoice')로 재생성.

alter table public.finance_entries drop constraint finance_entries_source_check;
alter table public.finance_entries
  add constraint finance_entries_source_check
  check (source = any (array['manual'::text, 'ocr'::text, 'invoice'::text, 'bank'::text]));

alter table public.finance_entries add column if not exists import_fp text;

alter table public.finance_entries
  add constraint finance_entries_import_fp_key unique (workspace_id, import_fp);
