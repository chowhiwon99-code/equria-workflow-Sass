/**
 * Claude 모델별 토큰 단가 → 호출 비용(USD) 계산. 서버사이드 유틸(사용량 기록 시점).
 *
 * 단가는 100만 토큰(MTok)당 USD 추정치다. Anthropic 가격이 바뀌면 여기만 갱신하면 된다.
 * 정확한 청구액은 Anthropic 콘솔 기준이며, 이 값은 내부 추적·예산 감시용 추정이다.
 */
// 현재 모델 공식 단가(2026-08): Fable/Mythos 5 = $10/$50 · Opus(4.6~5) = $5/$25 · Sonnet(4.6~5) = $3/$15 · Haiku 4.5 = $1/$5.
// ⚠️ Sonnet 5는 2026-08-31까지 도입가 $2/$10 — 도입가는 반영하지 않는다(만료 후 과소계상이 더 위험).
const PRICE_PER_MTOK: Record<"fable" | "opus" | "sonnet" | "haiku", { input: number; output: number }> = {
  fable: { input: 10, output: 50 },
  opus: { input: 5, output: 25 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
}

/** 모델 id(claude-opus-5 / claude-sonnet-4-6 / claude-haiku-4-5 …)를 단가 티어로 매핑. 알 수 없으면 sonnet.
 *  fable/mythos를 먼저 잡지 않으면 sonnet으로 폴백해 원가를 3.3배 과소계상한다. */
function tierForModel(model: string | null | undefined): keyof typeof PRICE_PER_MTOK {
  const m = (model ?? "").toLowerCase()
  if (m.includes("fable") || m.includes("mythos")) return "fable"
  if (m.includes("opus")) return "opus"
  if (m.includes("haiku")) return "haiku"
  return "sonnet"
}

/** 프롬프트 캐싱 배수(Anthropic) — 쓰기 1.25×(5분 TTL) · 읽기 0.1×. 입력 단가에만 적용된다. */
const CACHE_WRITE_MULT = 1.25
const CACHE_READ_MULT = 0.1

/** AI SDK `usage.inputTokenDetails`에서 오는 캐시 토큰 내역. */
export type CacheTokens = { readTokens?: number; writeTokens?: number }

/** 호출 1건의 추정 비용(USD). microdollar(6자리) 반올림.
 *
 *  ⚠️ **`inputTokens`는 캐시 토큰을 포함한 총합이다.** @ai-sdk/anthropic의 convertAnthropicMessagesUsage가
 *  `total = input_tokens + cache_creation + cache_read`로 합산해 넘긴다(Anthropic 원본 API와 반대).
 *  따라서 캐시분을 빼지 않고 전부 정가로 계산하면 캐시 읽기를 10배 과다 청구하게 된다.
 *  cache 인자를 생략하면 종전과 동일하게 전량 정가로 계산한다(하위 호환). */
export function computeCostUsd(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
  cache?: CacheTokens
): number {
  const p = PRICE_PER_MTOK[tierForModel(model)]
  const cacheRead = Math.max(0, cache?.readTokens ?? 0)
  const cacheWrite = Math.max(0, cache?.writeTokens ?? 0)
  const plainInput = Math.max(0, inputTokens - cacheRead - cacheWrite)
  const cost =
    (plainInput * p.input +
      cacheWrite * p.input * CACHE_WRITE_MULT +
      cacheRead * p.input * CACHE_READ_MULT +
      outputTokens * p.output) /
    1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}

/** 표시용 포맷. 매우 작은 값도 0이 아니게 보이도록 4자리까지. */
export function formatUsd(cost: number): string {
  if (cost === 0) return "$0"
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}
