-- 106: 에이전트 기억 우선순위(importance) — AI 정리·중요도순 주입·카테고리 뷰용 (추가형).
-- 1=낮음, 2=보통(기본), 3=높음. 채팅 주입은 importance desc, created_at desc → 중요한 규칙이 최근 잡담에 안 밀림.
-- 롤백: alter table public.agent_memories drop column importance;
alter table public.agent_memories
  add column if not exists importance smallint not null default 2;

comment on column public.agent_memories.importance is '기억 중요도 1~3(높을수록 우선 주입·상단 표시). AI 정리가 매김. 기본 2.';
