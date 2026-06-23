-- 068: 기본 에이전트 8개 온도(temperature) 성격별 차등 — A②.
-- 배경: 067로 매뉴얼 재작성했으나 온도는 전부 0.7(seed 미설정). 성격별 차등(AGENTS-MCP-STRATEGY §5):
--   정확성(번역·세금·법무)=0.3 / 균형(CS·데이터=0.5·문서=0.6) / 창의(SNS·이미지)=0.9.
-- 라이브 현재 버전(is_current)의 temperature만 변경. DDL 없음(데이터). 되돌리기=전부 0.7로.
-- 멱등(UPDATE). 컬럼 CHECK는 0~1이라 안전.

update public.agent_versions av
set temperature = t.temp
from (values
  ('세금계산서 에이전트', 0.3),
  ('번역 에이전트', 0.3),
  ('법무 검토 에이전트', 0.3),
  ('CS 응대 에이전트', 0.5),
  ('데이터 분석 에이전트', 0.5),
  ('문서 작성 에이전트', 0.6),
  ('SNS 콘텐츠 에이전트', 0.9),
  ('Higgsfield 프롬프트 에이전트', 0.9)
) as t(name, temp)
join public.agents a on a.name = t.name and a.created_by is null
where av.agent_id = a.id and av.is_current;
