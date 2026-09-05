-- 154: 아이디어 재부상 + 아이디어 지도(뇌구조) 캐시 — 회의노트 대개편 P4
--
-- 재부상(resurfacing): 창고의 가치는 "저장"이 아니라 **잊고 있던 게 다시 떠오르는 것**이다
-- (Readwise Daily Review·Napkin의 간격 반복 — 회의 AI 카테고리에서 아무도 안 하는 축, 세션56 조사).
-- 크론 없이 화면 로드 시 계산한다: last_surfaced_at이 가장 오래된(또는 없는) 것부터 N개.
-- touch_ideas_surfaced가 커서를 갱신해 다음엔 다른 아이디어가 올라온다.
--
-- 아이디어 지도: ideas 코퍼스 → AI가 노드/링크 추출 → 워크스페이스당 1행 캐시(idea_graphs).
-- 매번 재생성하면 토큰이 낭비되므로 **명시적 새로고침**일 때만 갱신한다(대표 품질 기준: 효율).
--
-- 롤백:
--   drop function if exists public.touch_ideas_surfaced(uuid[]);
--   drop table if exists public.idea_graphs;

create or replace function public.touch_ideas_surfaced(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ideas
     set last_surfaced_at = now(),
         surface_count = surface_count + 1
   where id = any(p_ids)
     and workspace_id in (select public.auth_user_workspace_ids()); -- 남의 회사 아이디어는 못 건드린다
end
$$;

revoke execute on function public.touch_ideas_surfaced(uuid[]) from anon;

create table if not exists public.idea_graphs (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  graph jsonb not null,                 -- { nodes: [{id,label,group}], links: [{source,target,rel}] }
  idea_count int not null default 0,    -- 생성 시점의 아이디어 수(신선도 표시용)
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.idea_graphs enable row level security;

drop policy if exists "idea_graphs_select" on public.idea_graphs;
create policy "idea_graphs_select" on public.idea_graphs for select using (
  workspace_id in (select public.auth_user_workspace_ids())
);

-- 지도 생성은 서버 라우트(admin 아님, 사용자 세션)에서 upsert — 멤버 누구나 새로고침할 수 있다.
drop policy if exists "idea_graphs_insert" on public.idea_graphs;
create policy "idea_graphs_insert" on public.idea_graphs for insert with check (
  public.is_workspace_member(workspace_id)
);

drop policy if exists "idea_graphs_update" on public.idea_graphs;
create policy "idea_graphs_update" on public.idea_graphs for update using (
  workspace_id in (select public.auth_user_workspace_ids())
) with check (
  workspace_id in (select public.auth_user_workspace_ids())
);
