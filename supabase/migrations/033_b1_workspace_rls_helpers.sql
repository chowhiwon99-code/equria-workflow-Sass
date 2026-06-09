-- 033: B1-a 테넌트 격리 1단계 — RLS 헬퍼 함수 3종 + 멤버십 복합 인덱스.
--
-- 목적: 034~041에서 24개 테이블 RLS를 "내가 속한 워크스페이스 데이터만"으로 재작성할 때
--       모든 정책이 공통으로 쓸 헬퍼를 먼저 깐다. 이 마이그는 순수 additive(함수/인덱스 신설)라
--       기존 정책·데이터·앱에 영향 0. 되돌리기 = drop function/index.
--
-- 설계: B1-DESIGN.md §2. 읽기 격리는 멤버십 함수, 쓰기 강제는 앱 명시(하이브리드, JWT hook 불필요).
-- 멱등: create or replace / if not exists.

-- ── 1) 멤버십 복합 인덱스 (헬퍼 조회를 인덱스-온리 스캔으로) ──
-- 030이 (user_id) 인덱스를 깔았으나, (user_id) → workspace_id 회수를 인덱스만으로 끝내려 복합 추가.
create index if not exists idx_workspace_members_user_ws
  on public.workspace_members (user_id, workspace_id);

-- ── 2) auth_user_workspace_ids(): 현재 사용자가 속한 워크스페이스 id 전부 ──
-- 모든 SELECT 정책에서 `workspace_id in (select public.auth_user_workspace_ids())` 형태로 사용.
-- security definer: workspace_members를 RLS 우회로 안전하게 읽되, 내부에서 (select auth.uid())로
--   호출자 본인 멤버십에만 한정 → 권한 상승 없음. RLS 재귀(멤버십 테이블 정책이 헬퍼를 다시 부르는)도 회피.
-- stable: PostgreSQL이 한 쿼리 안에서 한 번만 계산(여러 정책 반복 호출에도 비용 안 곱해짐).
create or replace function public.auth_user_workspace_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select workspace_id
  from public.workspace_members
  where user_id = (select auth.uid())
$$;

-- ── 3) is_workspace_member(ws_id): 현재 사용자가 ws_id 멤버인가 ──
-- INSERT/UPDATE 정책의 with check 에서 `public.is_workspace_member(workspace_id)` 로 사용
--   → 자기가 속하지 않은 워크스페이스로 쓰기 차단.
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = ws_id
      and user_id = (select auth.uid())
  )
$$;

-- ── 4) current_workspace_id(): (선택적 최적화) JWT 클레임의 현재 워크스페이스, 없으면 NULL ──
-- 034~041 설계는 이 함수 없이도 완결된다. 추후 JWT custom access token hook을 붙여
--   app_metadata.workspace_id 를 임베드하면, INSERT 기본값/필터를 더 빠르게 쓰기 위한 용도.
-- 클레임이 없으면 NULL(안전) — 절대 임의 워크스페이스로 귀속시키지 않는다.
create or replace function public.current_workspace_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select nullif(
    coalesce(
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'workspace_id'),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'workspace_id')
    ),
    ''
  )::uuid
$$;

-- ── 5) 실행 권한 ──
-- RLS 정책 평가 시 호출자(authenticated)가 실행할 수 있어야 한다.
grant execute on function public.auth_user_workspace_ids() to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.current_workspace_id() to authenticated;
