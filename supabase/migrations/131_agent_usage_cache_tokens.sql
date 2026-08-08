-- 131_agent_usage_cache_tokens.sql
-- 프롬프트 캐싱 효과 측정 + 정확한 원가 계산을 위한 캐시 토큰 내역 기록(추가형).
--
-- 배경: AI SDK(@ai-sdk/anthropic)의 usage.inputTokens는 캐시 토큰을 '포함한' 총합이라
-- tokens_input만으로는 캐시 적중률도, 실제 원가도 알 수 없다. 두 컬럼은 tokens_input의 내역이다
-- (tokens_input = 정가분 + cache_read_tokens + cache_write_tokens).
--
-- 롤백:
--   alter table public.agent_usage drop column cache_read_tokens, drop column cache_write_tokens;

alter table public.agent_usage
  add column if not exists cache_read_tokens integer not null default 0,
  add column if not exists cache_write_tokens integer not null default 0;

comment on column public.agent_usage.cache_read_tokens is
  '프롬프트 캐시에서 읽은 입력 토큰(입력 정가의 0.1× 과금). tokens_input에 포함된 값의 내역.';
comment on column public.agent_usage.cache_write_tokens is
  '프롬프트 캐시에 새로 쓴 입력 토큰(입력 정가의 1.25× 과금). tokens_input에 포함된 값의 내역.';
