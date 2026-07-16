-- 099: 에이전트 학습·기억(v1, 개인용) — 사용자가 에이전트를 쓰며 쌓인 "오래 쓸 사실·선호·교정"을 저장.
-- "쓸수록 나에게 맞춰지는" 학습의 저장소. 파인튜닝(모델 재학습) 아님 = 앱레벨 메모리(다음 대화에 다시 주입).
-- v1은 개인용만(092 personal_tasks 패턴: user_id "본인만" RLS, workspace 컬럼·센티넬 불필요).
--   프로젝트 공유(scope='project')·의미검색(embedding vector)은 v1.5/v2에서 "추가형"으로 붙인다(재마이그 안전).
-- 설계 = AGENTS-LEARNING-DESIGN.md §9.

create table if not exists public.agent_memories (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,   -- 이 기억의 주인(본인만 접근)
  agent_id               uuid not null references public.agents(id)   on delete cascade,   -- 어느 에이전트에 대한 기억인가
  kind                   text not null default 'preference'
                           check (kind in ('fact','preference','style','correction')),     -- 사실/선호/말투/교정
  content                text not null,                                                    -- 오래 쓸 한 문장(예: "표 형식을 선호")
  source_conversation_id uuid,                                                             -- 어느 대화에서 뽑혔나(출처·신뢰)
  deleted_at             timestamptz,                                                      -- soft-delete(휴지통·⌘Z), 목록은 null만
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.agent_memories is
  '에이전트 개인 기억(v1) — 사용자×에이전트, 본인만 RLS. 다음 대화에 주입해 "쓸수록 맞춰짐". soft-delete.';

-- 빨리 찾기용 색인(index): 이 사용자 + 이 에이전트의 "살아있는"(안 지운) 기억만 골라오게.
create index if not exists idx_agent_memories_user_agent
  on public.agent_memories (user_id, agent_id) where deleted_at is null;

-- 행 수준 보안(RLS): "본인 행만" — 092 personal_tasks와 동일. DB가 강제 → 앱이 실수해도 남의 기억 못 봄.
alter table public.agent_memories enable row level security;

drop policy if exists "amem_select" on public.agent_memories;
create policy "amem_select" on public.agent_memories for select using (auth.uid() = user_id);

drop policy if exists "amem_insert" on public.agent_memories;
create policy "amem_insert" on public.agent_memories for insert with check (auth.uid() = user_id);

drop policy if exists "amem_update" on public.agent_memories;
create policy "amem_update" on public.agent_memories for update using (auth.uid() = user_id);

drop policy if exists "amem_delete" on public.agent_memories;
create policy "amem_delete" on public.agent_memories for delete using (auth.uid() = user_id);
