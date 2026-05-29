import { createAnthropic } from "@ai-sdk/anthropic"

/**
 * Anthropic provider (AI SDK v6). 서버 전용 — ANTHROPIC_API_KEY는 클라이언트 노출 금지.
 */
export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

/** 모델 별칭 — 기본/복잡 작업 구분 (latest-stack.md 기준) */
export const MODELS = {
  default: "claude-sonnet-4-6",
  complex: "claude-opus-4-7",
} as const
