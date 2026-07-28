-- 117: 대화 요약 압축(트랙2) — conversations에 요약 컬럼 (추가형·멱등)
--
-- 문제: 에이전트 채팅이 HISTORY_WINDOW(10턴) 슬라이딩 윈도우라 오래된 턴이 뚝 잘려
--   "질문하다 앞 내용 까먹음"(대표 리포트, 세션38 '멍청 게이지' 반려의 정직한 대안).
-- 해결: 윈도우 밖으로 밀려난 턴을 Haiku로 압축 요약해 conversations.summary에 저장,
--   다음 턴부터 시스템 프롬프트에 "지금까지의 대화 요약"으로 주입(onFinish 백그라운드 갱신).
-- summary_upto = 클라이언트 메시지 배열 기준으로 요약이 커버한 메시지 개수(증분 요약용 커서).
-- RLS: conversations 기존 정책(본인 것만) 그대로 — 새 정책 불요. 롤백 = 두 컬럼 drop.

alter table public.conversations
  add column if not exists summary text,
  add column if not exists summary_upto int not null default 0;
