-- 077: 회의노트 꼬리물기 그래프 영구화 — meeting_notes.graph(jsonb) 추가.
--   저장 시 graphData(nodes/links)를 노트에 저장하고, 노트를 다시 열면 ResearchGraph로 인터랙티브 복원.
--   본문 HTML과 별개(그래프는 시각화 데이터). RLS 무변 — 컬럼은 기존 meeting_notes 정책을 상속한다. 멱등.
alter table public.meeting_notes add column if not exists graph jsonb;
