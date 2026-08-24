-- 143: 요금제별 기능 게이팅(HANDOFF §다음 세션 착수 — 마케팅 개시 조건 A)
--
-- 왜 트리거인가: 아래 16개 테이블은 전부 클라이언트가 Supabase로 직접 insert한다(API 라우트 없음).
-- 화면만 막으면 supabase-js 직접 호출로 우회된다 — 134(모델 게이트)·125(시트 게이팅)와 같은 이유로
-- BEFORE INSERT 트리거를 유일한 강제 지점으로 쓴다. 트리거는 RLS·service_role 클라이언트 여부와
-- 무관하게 항상 발동한다(134 헤더 주석 참고).
--
-- 그랜드파더: 안 함(대표 결정 2026-08-24). 적용 전 확인 결과 '테스트'(standard)·'이큐리아2'(premium)는
-- 이 16개 테이블 전부 0건이라 소급 충돌이 없다. premium(EQURIA·이큐리아2)은 애초에 게이팅 대상 아님.
--
-- 범위 = 랜딩 PLAN_ROWS(LandingPage.tsx)와 정확히 일치, src/lib/config/features.ts의 minPlan이 앱 쪽 SSOT:
--   전자결재·근태(Standard+): approval_documents · attendance_records · leave_requests · expense_reports
--   회의노트·명함·비용/매출(Standard+): meeting_notes · meeting_note_folders · business_cards ·
--     finance_entries · tax_invoices · cash_accounts · cash_transfers · cash_categories ·
--     cashflow_settings · cash_calc_types (전부 /finance 페이지 하위)
--   워크플로우·MCP 연동(Pro+): workflows · mcp_servers
-- 범위 밖(의도적, 대표 확인): mcp_user_connections — workspace_id 컬럼이 없는 직원 개인 커넥터라
--   "어느 워크스페이스 기준으로 막을지" 애매해 보류.
--
-- 롤백:
--   drop trigger if exists approval_documents_plan_gate on public.approval_documents;
--   drop trigger if exists attendance_records_plan_gate on public.attendance_records;
--   drop trigger if exists leave_requests_plan_gate on public.leave_requests;
--   drop trigger if exists expense_reports_plan_gate on public.expense_reports;
--   drop trigger if exists meeting_notes_plan_gate on public.meeting_notes;
--   drop trigger if exists meeting_note_folders_plan_gate on public.meeting_note_folders;
--   drop trigger if exists business_cards_plan_gate on public.business_cards;
--   drop trigger if exists finance_entries_plan_gate on public.finance_entries;
--   drop trigger if exists tax_invoices_plan_gate on public.tax_invoices;
--   drop trigger if exists cash_accounts_plan_gate on public.cash_accounts;
--   drop trigger if exists cash_transfers_plan_gate on public.cash_transfers;
--   drop trigger if exists cash_categories_plan_gate on public.cash_categories;
--   drop trigger if exists cashflow_settings_plan_gate on public.cashflow_settings;
--   drop trigger if exists cash_calc_types_plan_gate on public.cash_calc_types;
--   drop trigger if exists workflows_plan_gate on public.workflows;
--   drop trigger if exists mcp_servers_plan_gate on public.mcp_servers;
--   drop function if exists public.enforce_plan_feature_gate();
--   drop function if exists public.plan_rank(text);

-- ============================================================ 헬퍼
-- 플랜 등급(0=free~3=premium). src/lib/plans.ts의 PLAN_ORDER·planRank와 반드시 같은 순서.
create or replace function public.plan_rank(p_plan text)
returns int language sql immutable set search_path = public as $$
  select case coalesce(p_plan, 'free')
           when 'free' then 0
           when 'standard' then 1
           when 'pro' then 2
           when 'premium' then 3
           else 0
         end
$$;

-- 공용 게이트 트리거 함수 — tg_argv[0]=최소플랜, tg_argv[1]=안내 문구.
create or replace function public.enforce_plan_feature_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_min_plan text := tg_argv[0];
  v_message text := tg_argv[1];
begin
  select w.plan into v_plan from public.workspaces w where w.id = new.workspace_id;

  if public.plan_rank(v_plan) >= public.plan_rank(v_min_plan) then
    return new;
  end if;

  raise exception '%', v_message using errcode = 'check_violation';
end;
$$;

-- 트리거 전용 함수 → REST /rpc로 직접 호출될 수 없게 막는다(safe-changes §5, 134와 동일 이유).
revoke execute on function public.plan_rank(text) from public, anon, authenticated;
revoke execute on function public.enforce_plan_feature_gate() from public, anon, authenticated;

-- ============================================================ 전자결재·근태 (Standard+)
drop trigger if exists approval_documents_plan_gate on public.approval_documents;
create trigger approval_documents_plan_gate
  before insert on public.approval_documents
  for each row execute function public.enforce_plan_feature_gate('standard', '전자결재는 Standard 요금제부터 사용할 수 있어요.');

drop trigger if exists attendance_records_plan_gate on public.attendance_records;
create trigger attendance_records_plan_gate
  before insert on public.attendance_records
  for each row execute function public.enforce_plan_feature_gate('standard', '근태 기록은 Standard 요금제부터 사용할 수 있어요.');

drop trigger if exists leave_requests_plan_gate on public.leave_requests;
create trigger leave_requests_plan_gate
  before insert on public.leave_requests
  for each row execute function public.enforce_plan_feature_gate('standard', '휴가 신청은 Standard 요금제부터 사용할 수 있어요.');

drop trigger if exists expense_reports_plan_gate on public.expense_reports;
create trigger expense_reports_plan_gate
  before insert on public.expense_reports
  for each row execute function public.enforce_plan_feature_gate('standard', '지출결의서는 Standard 요금제부터 사용할 수 있어요.');

-- ============================================================ 회의노트·명함·비용/매출 (Standard+)
drop trigger if exists meeting_notes_plan_gate on public.meeting_notes;
create trigger meeting_notes_plan_gate
  before insert on public.meeting_notes
  for each row execute function public.enforce_plan_feature_gate('standard', '회의 노트는 Standard 요금제부터 사용할 수 있어요.');

drop trigger if exists meeting_note_folders_plan_gate on public.meeting_note_folders;
create trigger meeting_note_folders_plan_gate
  before insert on public.meeting_note_folders
  for each row execute function public.enforce_plan_feature_gate('standard', '회의 노트는 Standard 요금제부터 사용할 수 있어요.');

drop trigger if exists business_cards_plan_gate on public.business_cards;
create trigger business_cards_plan_gate
  before insert on public.business_cards
  for each row execute function public.enforce_plan_feature_gate('standard', '명함 관리는 Standard 요금제부터 사용할 수 있어요.');

drop trigger if exists finance_entries_plan_gate on public.finance_entries;
create trigger finance_entries_plan_gate
  before insert on public.finance_entries
  for each row execute function public.enforce_plan_feature_gate('standard', '비용·매출 관리는 Standard 요금제부터 사용할 수 있어요.');

drop trigger if exists tax_invoices_plan_gate on public.tax_invoices;
create trigger tax_invoices_plan_gate
  before insert on public.tax_invoices
  for each row execute function public.enforce_plan_feature_gate('standard', '세금계산서 작성은 Standard 요금제부터 사용할 수 있어요.');

drop trigger if exists cash_accounts_plan_gate on public.cash_accounts;
create trigger cash_accounts_plan_gate
  before insert on public.cash_accounts
  for each row execute function public.enforce_plan_feature_gate('standard', '현금흐름 관리는 Standard 요금제부터 사용할 수 있어요.');

drop trigger if exists cash_transfers_plan_gate on public.cash_transfers;
create trigger cash_transfers_plan_gate
  before insert on public.cash_transfers
  for each row execute function public.enforce_plan_feature_gate('standard', '현금흐름 관리는 Standard 요금제부터 사용할 수 있어요.');

drop trigger if exists cash_categories_plan_gate on public.cash_categories;
create trigger cash_categories_plan_gate
  before insert on public.cash_categories
  for each row execute function public.enforce_plan_feature_gate('standard', '현금흐름 관리는 Standard 요금제부터 사용할 수 있어요.');

drop trigger if exists cashflow_settings_plan_gate on public.cashflow_settings;
create trigger cashflow_settings_plan_gate
  before insert on public.cashflow_settings
  for each row execute function public.enforce_plan_feature_gate('standard', '현금흐름 관리는 Standard 요금제부터 사용할 수 있어요.');

drop trigger if exists cash_calc_types_plan_gate on public.cash_calc_types;
create trigger cash_calc_types_plan_gate
  before insert on public.cash_calc_types
  for each row execute function public.enforce_plan_feature_gate('standard', '현금흐름 관리는 Standard 요금제부터 사용할 수 있어요.');

-- ============================================================ 워크플로우·MCP 연동 (Pro+)
drop trigger if exists workflows_plan_gate on public.workflows;
create trigger workflows_plan_gate
  before insert on public.workflows
  for each row execute function public.enforce_plan_feature_gate('pro', '워크플로우는 Pro 요금제부터 사용할 수 있어요.');

drop trigger if exists mcp_servers_plan_gate on public.mcp_servers;
create trigger mcp_servers_plan_gate
  before insert on public.mcp_servers
  for each row execute function public.enforce_plan_feature_gate('pro', 'MCP 연동은 Pro 요금제부터 사용할 수 있어요.');
