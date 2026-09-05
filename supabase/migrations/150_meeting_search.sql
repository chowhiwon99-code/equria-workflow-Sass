-- 150: 회의노트·아이디어 검색 인프라 — 회의노트 대개편 P2 (계획: fluffy-cooking-nest, 세션56 승인)
--
-- 이 DB의 첫 검색 인프라(기존 tsvector/trgm 0건). 한국어는 형태소 분석기가 없어 tsvector가 약하다 →
-- **pg_trgm이 주력**: GIN 트라이그램 인덱스가 ILIKE '%질의%'를 가속하고 similarity()가 랭킹을 준다.
-- content는 HTML이라 strip_html(immutable) → search_text generated column으로 평문화해 인덱싱.
-- ⚠️ generated column 추가는 테이블 리라이트를 유발 — 현재 소규모(팀당 수십~수백 행)라 무해.
-- 검색 소비자(검색창·컴피 도구·크로스미팅 질의·관련 사이드바)는 전부 search_meeting_notes RPC 하나를 쓴다
-- (인터페이스 고정 — 나중에 pgvector로 갈아타도 소비자 코드 무변).
--
-- 롤백:
--   drop function if exists public.search_meeting_notes(uuid, text, int);
--   drop index if exists idx_mn_trgm; drop index if exists idx_ideas_trgm;
--   alter table public.meeting_notes drop column if exists search_text;
--   drop function if exists public.strip_html(text);

create or replace function public.strip_html(t text)
returns text
language sql immutable
set search_path = ''
as $$ select regexp_replace(coalesce(t, ''), '<[^>]*>', ' ', 'g') $$;

alter table public.meeting_notes
  add column if not exists search_text text
  generated always as (title || ' ' || coalesce(attendees, '') || ' ' || public.strip_html(content)) stored;

create index if not exists idx_mn_trgm on public.meeting_notes using gin (search_text gin_trgm_ops);
create index if not exists idx_ideas_trgm on public.ideas using gin ((title || ' ' || body) gin_trgm_ops);

-- security invoker(기본) — RLS(mn_select: 멤버 전원)를 그대로 태운다. p_workspace는 스코프 축소용.
create or replace function public.search_meeting_notes(p_workspace uuid, p_q text, p_limit int default 10)
returns table(id uuid, title text, meeting_date date, rank real, snippet text)
language sql stable
set search_path = public
as $$
  select n.id,
         n.title,
         n.meeting_date,
         greatest(similarity(n.title, p_q), similarity(n.search_text, p_q))::real as rank,
         case
           when position(lower(p_q) in lower(n.search_text)) > 0 then
             trim(substring(n.search_text
               from greatest(position(lower(p_q) in lower(n.search_text)) - 40, 1) for 180))
           else trim(left(n.search_text, 180))
         end as snippet
  from public.meeting_notes n
  where n.workspace_id = p_workspace
    and (n.title ilike '%' || p_q || '%' or n.search_text ilike '%' || p_q || '%')
  order by rank desc, n.meeting_date desc nulls last, n.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30)
$$;
