-- 151: 회의노트 검색에 유사도(부분 일치) 매칭 추가 — 회의노트 대개편 P2 후속
--
-- 150의 RPC는 ilike 부분문자열만 봤다. 그래서 "관련 항목 사이드카"처럼 **문장 전체**를 질의로 넣으면
-- (예: "리필 파우치 구독 전략 회의") 정확히 그 문자열을 포함한 노트만 걸려 관련 회의를 못 찾는다.
-- word_similarity(q, text)는 질의의 연속 구간이 문서에 얼마나 잘 나타나는지를 재므로,
-- 긴 질의에서도 "리필 파우치"처럼 겹치는 부분을 잡아낸다. 오타 허용 효과도 같이 얻는다.
--
-- 임계 0.35는 소규모 데이터에서 관련 노트를 놓치지 않으면서 잡음이 적은 값(E2E 실측 기준).
-- ⚠️ OR 조건이라 이 경로는 GIN 인덱스를 못 타고 순차 스캔이다 — 워크스페이스당 회의록 수백 건
--    규모를 전제한 선택. 노트가 수천 건대로 늘면 word_similarity를 `<%` 연산자 + 인덱스 경로로
--    바꾸거나(word_similarity_threshold 설정 필요) 후보를 ilike로 먼저 좁힐 것.
--
-- 롤백: 150의 create or replace function 블록을 다시 적용하면 된다.

create or replace function public.search_meeting_notes(p_workspace uuid, p_q text, p_limit int default 10)
returns table(id uuid, title text, meeting_date date, rank real, snippet text)
language sql stable
set search_path = public
as $$
  select n.id,
         n.title,
         n.meeting_date,
         greatest(
           similarity(n.title, p_q),
           word_similarity(p_q, n.title),
           word_similarity(p_q, n.search_text)
         )::real as rank,
         case
           when position(lower(p_q) in lower(n.search_text)) > 0 then
             trim(substring(n.search_text
               from greatest(position(lower(p_q) in lower(n.search_text)) - 40, 1) for 180))
           else trim(left(n.search_text, 180))
         end as snippet
  from public.meeting_notes n
  where n.workspace_id = p_workspace
    and (
      n.title ilike '%' || p_q || '%'
      or n.search_text ilike '%' || p_q || '%'
      or word_similarity(p_q, n.title) > 0.35
      or word_similarity(p_q, n.search_text) > 0.35
    )
  order by rank desc, n.meeting_date desc nulls last, n.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30)
$$;
