/**
 * Claude 모델별 토큰 단가 → 호출 비용(USD) 계산. 서버사이드 유틸(사용량 기록 시점).
 *
 * 단가는 100만 토큰(MTok)당 USD 추정치다. Anthropic 가격이 바뀌면 여기만 갱신하면 된다.
 * 정확한 청구액은 Anthropic 콘솔 기준이며, 이 값은 내부 추적·예산 감시용 추정이다.
 */
// 현재 모델 공식 단가(2026-06): Opus 4.7 = $5/$25 · Sonnet 4.6 = $3/$15 · Haiku 4.5 = $1/$5.
const PRICE_PER_MTOK: Record<"opus" | "sonnet" | "haiku", { input: number; output: number }> = {
  opus: { input: 5, output: 25 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
}

/** 모델 id(claude-opus-4-7 / claude-sonnet-4-6 / claude-haiku-4-5 …)를 단가 티어로 매핑. 알 수 없으면 sonnet. */
function tierForModel(model: string | null | undefined): keyof typeof PRICE_PER_MTOK {
  const m = (model ?? "").toLowerCase()
  if (m.includes("opus")) return "opus"
  if (m.includes("haiku")) return "haiku"
  return "sonnet"
}

/** 호출 1건의 추정 비용(USD). microdollar(6자리) 반올림. */
export function computeCostUsd(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  const p = PRICE_PER_MTOK[tierForModel(model)]
  const cost = (inputTokens * p.input + outputTokens * p.output) / 1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}

/** 표시용 포맷. 매우 작은 값도 0이 아니게 보이도록 4자리까지. */
export function formatUsd(cost: number): string {
  if (cost === 0) return "$0"
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}
