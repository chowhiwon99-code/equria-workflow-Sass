-- 122: 손익 분류 마스터(매출/비용별 편집 — 세션41 대표 요청)
-- cashflow_settings.ledger_categories jsonb = {"revenue": [...], "expense": [...]}
-- null = 기본 동작(하드코딩 기본 분류 + 실사용 분류 합집합). 설정 패널 '분류 관리'에서 편집.
-- 분류 삭제는 목록에서만 빠짐 — 기존 finance_entries 기록의 분류 문자열은 그대로 보존.
-- 롤백: alter table public.cashflow_settings drop column if exists ledger_categories;

alter table public.cashflow_settings
  add column if not exists ledger_categories jsonb;
