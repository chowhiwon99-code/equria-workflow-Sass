-- 156: 결정 원장 + 번복 연결 — "회의록 앱 → 결정 인프라" 전환 (계획: ~/.claude/plans/fluffy-cooking-nest.md)
--
-- 🔴 설계 원칙 — 어기면 제품이 죽는다. 나중에 필드를 추가하고 싶어지면 이 주석을 먼저 읽을 것:
--    **폼 0개 · 입력 필드 0개 · 클릭 1개(전체 승인).**
--    시장 근거: ADR(결정 기록)을 도입한 GitHub 리포의 **50%가 레코드 5건 미만**이고, 응답자 83%가
--    "드물게만 작성"한다고 답했다. 결정 기록 제품이 죽는 원인은 기록의 가치가 아니라 **등록 UI**다.
--    Cloverpop(결정 인텔리전스 10년)이 누적 조달 $3.4M에 정체한 것도 같은 이유.
--    → 사람은 AI가 뽑은 것을 **승인만** 한다. "담당자 필드 하나만 더" 하는 순간 우리도 그 통계에 합류한다.
--
-- 왜 원장이 필요한가: 회의의 37%만 결정에 도달하고, 기록이 없으면 결정의 70%가 24시간 내에 잊힌다.
-- 그리고 우리가 P2에서 만든 크로스미팅 검색은 "2026년 가장 안 쓰이는 기능"으로 지목됐다(Laxis) —
-- 사람은 찾으러 가지 않는다. 그래서 이 원장의 소비 방식은 검색이 아니라 **push**다(Unit B 배너).
--
-- 번복(supersession) 연결이 이 테이블의 존재 이유다. 원장만 있으면 "AI가 대신 써주는 ADR"이라 읽을
-- 이유가 없고, "이 결정 아직 유효한가"에 답할 수 있을 때만 사용 동기가 생긴다. 현존 제품 중 번복
-- 관계를 다루는 곳(decisionlog.ai·Axiom Hub)은 전부 **AI 에이전트용**이고 인간 회의용은 비어 있다.
--
-- 롤백:
--   drop function if exists public.link_decision_supersede(uuid, uuid, text);
--   drop function if exists public.search_decisions(uuid, text, text[], text, text, date, uuid, int);
--   drop trigger if exists meeting_decisions_plan_gate on public.meeting_decisions;
--   drop table if exists public.meeting_decision_scans;
--   drop table if exists public.meeting_decisions;
--   -- notifications CHECK은 값 추가라 되돌리지 않아도 무해.

-- ============================================================ 원장
create table if not exists public.meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- ⚠️ 153(action_items)과 의도적으로 다르게 **set null**이다. 결정은 원장(durable asset)이라
  --    지저분한 노트를 지웠다고 사라지면 안 되고, 온도계의 과거 수치가 소급 변조되면 안 된다.
  --    대신 source_title/source_date를 비정규화해 고아 결정도 읽히게 하고, 배너 렌더에서 조인을 없앤다.
  note_id uuid references public.meeting_notes(id) on delete set null,
  kind text not null default 'decision' check (kind in ('decision', 'open_question')),
  statement text not null,                      -- 한 줄 결정문
  detail text,                                  -- 조건·전제(선택)
  topic text[] not null default '{}',           -- AI 정규화 태그 — 번복 매칭의 2번째 recall 채널
  owner_id uuid references public.profiles(id) on delete set null,
  decided_at date not null,                     -- 회의 날짜 기준(월 버킷팅의 기준)
  status text not null default 'active' check (status in ('active', 'superseded', 'dropped')),
  -- 번복 체인: 이 결정이 무엇을 대체하는가 + 어떤 성격인가.
  -- refines(구체화)는 번복이 아니다 — 온도계의 '재논의' 지표에서 제외해야 숫자가 거짓말을 안 한다.
  supersedes_id uuid references public.meeting_decisions(id) on delete set null,
  relation text check (relation in ('replaces', 'refines', 'contradicts')),
  resolves_id uuid references public.meeting_decisions(id) on delete set null, -- 미결(open_question) 해소
  dismissed_candidates uuid[] not null default '{}', -- "별개예요" 기억 — 같은 쌍을 두 번 묻지 않는다
  confidence real,
  source text not null default 'meeting' check (source in ('meeting', 'chat', 'manual')),
  source_app text,                              -- 'kakao' 등 (Unit C에서 사용, 사후 일괄 삭제 키)
  source_excerpt text,                          -- 근거 발췌(≤200자) — 개인정보 최소수집 경계
  source_title text,                            -- 비정규화(노트 삭제 후에도 렌더)
  source_date date,
  last_surfaced_at timestamptz,                 -- 재확인 커서(P4 재부상 패턴 재사용)
  surface_count int not null default 0,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_md_ws on public.meeting_decisions (workspace_id, kind, status, decided_at desc);
create index if not exists idx_md_note on public.meeting_decisions (note_id) where note_id is not null;
create index if not exists idx_md_supersedes on public.meeting_decisions (supersedes_id) where supersedes_id is not null;
create index if not exists idx_md_topic on public.meeting_decisions using gin (topic);
create index if not exists idx_md_trgm on public.meeting_decisions using gin (statement gin_trgm_ops);
-- ⚠️ 현재 규모(워크스페이스당 수백 행 · 결정문 300자)에선 순차 스캔이 정답이라 위 두 인덱스는
--    similarity() 경로에 안 쓰인다. 향후 `%` 연산자(set_limit 필요) 전환 대비 선반영일 뿐이다.

alter table public.meeting_decisions enable row level security;

-- 153 패턴: 결정 승인은 작성자 특권이 아니라 팀 행위 → 멤버 전원 SELECT/INSERT/UPDATE.
drop policy if exists "md_select" on public.meeting_decisions;
create policy "md_select" on public.meeting_decisions for select using (
  workspace_id in (select public.auth_user_workspace_ids())
);

drop policy if exists "md_insert" on public.meeting_decisions;
create policy "md_insert" on public.meeting_decisions for insert with check (
  public.is_workspace_member(workspace_id)
);

drop policy if exists "md_update" on public.meeting_decisions;
create policy "md_update" on public.meeting_decisions for update using (
  workspace_id in (select public.auth_user_workspace_ids())
) with check (
  workspace_id in (select public.auth_user_workspace_ids())
);

-- DELETE만 148 패턴으로 좁힌다 — 체인 중간이 지워지면 번복 히스토리가 끊긴다.
-- UI는 삭제 대신 status='dropped'(철회)를 제공한다.
drop policy if exists "md_delete" on public.meeting_decisions;
create policy "md_delete" on public.meeting_decisions for delete using (
  workspace_id in (select public.auth_user_workspace_ids())
  and ((select auth.uid()) = approved_by or public.auth_is_workspace_owner(workspace_id) or public.auth_is_admin())
);

drop trigger if exists meeting_decisions_plan_gate on public.meeting_decisions;
create trigger meeting_decisions_plan_gate
  before insert on public.meeting_decisions
  for each row execute function public.enforce_plan_feature_gate('standard', '결정 원장은 Standard 플랜부터 사용할 수 있어요.');

-- ============================================================ 스캔 커서
-- meeting_notes의 UPDATE RLS가 작성자·admin뿐이라 노트에 커서 컬럼을 붙일 수 없다(153과 같은 이유).
-- 이 테이블이 두 가지를 동시에 보장한다: ①같은 회의를 두 번 AI에 태우지 않는다 ②닫으면 다시 안 뜬다.
-- 플랜 게이트 없음 — 커서는 콘텐츠가 아니고, free는 애초에 meeting_notes insert가 막힌다(143).
create table if not exists public.meeting_decision_scans (
  note_id uuid primary key references public.meeting_notes(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scanned_len int not null default 0,           -- 마지막으로 훑은 본문 길이
  found_count int not null default 0,
  dismissed boolean not null default false,     -- 사용자가 배너를 닫았다 = 다시 띄우지 않는다
  scanned_at timestamptz not null default now(),
  scanned_by uuid references public.profiles(id) on delete set null
);

alter table public.meeting_decision_scans enable row level security;

drop policy if exists "mds_select" on public.meeting_decision_scans;
create policy "mds_select" on public.meeting_decision_scans for select using (
  workspace_id in (select public.auth_user_workspace_ids())
);

drop policy if exists "mds_insert" on public.meeting_decision_scans;
create policy "mds_insert" on public.meeting_decision_scans for insert with check (
  public.is_workspace_member(workspace_id)
);

drop policy if exists "mds_update" on public.meeting_decision_scans;
create policy "mds_update" on public.meeting_decision_scans for update using (
  workspace_id in (select public.auth_user_workspace_ids())
) with check (
  workspace_id in (select public.auth_user_workspace_ids())
);

-- ============================================================ 검색 RPC (소비자 4곳 공유)
-- 150의 원칙: 검색 진입점을 하나로 유지한다(브리핑 배너 · 번복 후보 · 에이전트 도구 · 결정 섹션).
-- ⚠️ 151의 교훈: trgm과 topic을 OR로 붙이면 인덱스를 못 타고 조건이 서로를 가린다 →
--    두 채널을 UNION ALL로 모아 max(sim)로 합친다.
create or replace function public.search_decisions(
  p_workspace uuid,
  p_q text default null,
  p_topics text[] default null,
  p_kind text default 'decision',
  p_status text default 'active',
  p_before date default null,
  p_exclude_note uuid default null,
  p_limit int default 5
)
returns table(
  id uuid, statement text, decided_at date, status text, topic text[],
  note_id uuid, source_title text, owner_id uuid, supersedes_id uuid, sim real
)
language sql stable
set search_path = public
as $$
  with base as (
    select d.* from public.meeting_decisions d
    where d.workspace_id = p_workspace
      and (p_kind is null or d.kind = p_kind)
      and (p_status is null or d.status = p_status)
      and (p_before is null or d.decided_at <= p_before)
      and (p_exclude_note is null or d.note_id is distinct from p_exclude_note)
  ),
  by_trgm as (
    select b.*, greatest(similarity(b.statement, p_q), word_similarity(p_q, b.statement))::real as sim
    from base b
    where p_q is not null and length(p_q) >= 2
      and (b.statement ilike '%' || p_q || '%' or similarity(b.statement, p_q) > 0.25)
  ),
  by_topic as (
    -- 한국어 패러프레이즈("9,900원으로" ↔ "구독가를 만원 밑으로")는 trgm이 못 잡는다 → 태그로 보완(0원)
    select b.*, 0.22::real as sim from base b
    where coalesce(p_topics, '{}') <> '{}' and b.topic && p_topics
  )
  select u.id, u.statement, u.decided_at, u.status, u.topic,
         u.note_id, u.source_title, u.owner_id, u.supersedes_id, max(u.sim)::real
  from (select * from by_trgm union all select * from by_topic) u
  group by u.id, u.statement, u.decided_at, u.status, u.topic, u.note_id, u.source_title, u.owner_id, u.supersedes_id
  order by max(u.sim) desc, u.decided_at desc
  limit least(greatest(coalesce(p_limit, 5), 1), 20)
$$;

-- ============================================================ 알림 타입
-- ⚠️ 153에서 실제로 실패한 지점 — 반드시 현재 정의를 먼저 읽고 **전체를 재나열**한다:
--    select pg_get_constraintdef(oid) from pg_constraint where conname='notifications_type_check';
--    (2026-09-06 확인: 12종. 여기에 decision_superseded만 추가해 13종)
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'dm','event_done','event_invite','project_assigned','mail','system','announcement',
    'approval','group','workflow','billing','action_item','decision_superseded'
  ]));

-- ============================================================ 번복 확정 RPC
-- 승인 자체는 클라이언트 insert(153 패턴)지만, 번복은 **두 행의 상태를 함께** 바꾸므로 원자화한다.
-- 🔴 사회적 안전장치: 번복 통보는 팀 전체가 아니라 **원 결정 owner 1명에게만** 간다.
--    "당신이 정한 걸 뒤집었습니다"를 공개적으로 알리면 5~10인 팀에서는 사회적 사고가 된다.
create or replace function public.link_decision_supersede(p_new uuid, p_old uuid, p_relation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_owner uuid;
  v_new_stmt text;
  v_old_stmt text;
  v_note text;
  v_actor uuid := auth.uid();
begin
  if p_relation is null or p_relation not in ('replaces', 'refines', 'contradicts') then
    raise exception '관계 값이 올바르지 않아요.' using errcode = 'check_violation';
  end if;

  select workspace_id, statement into v_ws, v_new_stmt
    from public.meeting_decisions where id = p_new;
  if v_ws is null then
    raise exception '결정을 찾을 수 없어요.' using errcode = 'no_data_found';
  end if;
  if not public.is_workspace_member(v_ws) then
    raise exception '권한이 없어요.' using errcode = 'insufficient_privilege';
  end if;

  -- 교차 워크스페이스 연결 차단(152 패턴)
  select owner_id, statement into v_owner, v_old_stmt
    from public.meeting_decisions where id = p_old and workspace_id = v_ws;
  if v_old_stmt is null then
    raise exception '대상 결정을 찾을 수 없어요.' using errcode = 'no_data_found';
  end if;

  update public.meeting_decisions
     set supersedes_id = p_old, relation = p_relation, updated_at = now()
   where id = p_new;

  -- refines(구체화)는 원 결정을 죽이지 않는다 — 지표·배너에서 여전히 유효한 결정이어야 한다.
  update public.meeting_decisions
     set status = 'superseded', updated_at = now()
   where id = p_old and p_relation in ('replaces', 'contradicts');

  if v_owner is not null and v_owner <> v_actor and p_relation in ('replaces', 'contradicts') then
    select coalesce(note_id::text, '') into v_note from public.meeting_decisions where id = p_new;
    insert into public.notifications (user_id, type, title, body, link, workspace_id)
    values (
      v_owner,
      'decision_superseded',
      '예전 결정이 바뀌었어요',
      left(v_old_stmt, 60) || ' → ' || left(v_new_stmt, 60),
      case when v_note <> '' then '/meetings?note=' || v_note else '/meetings' end,
      v_ws
    );
  end if;
end
$$;

revoke execute on function public.link_decision_supersede(uuid, uuid, text) from anon;
