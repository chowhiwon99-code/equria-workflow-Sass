// AI 사용량 기록 공용 헬퍼 — `agent_usage` INSERT를 한 곳으로 모은다.
//
// 왜 필요한가(세션44에 드러난 구멍): AI 호출 지점 23곳 중 **7곳이 기록을 아예 안 하고 있었다**
// (명함/영수증 OCR · 채팅/메일/회의록 다듬기 · 프롬프트 생성 · MCP 도구 요약).
// 마이그133이 차감을 `agent_usage` INSERT 트리거에 걸어 "누락을 구조적으로 불가능하게" 만들었지만,
// 트리거는 **기록하는 라우트만** 잡는다. 기록 자체를 안 하면 그물 밖이다 →
//   · 원가 집계에서 사라지고(60일 분석이 실제보다 작았다)
//   · 크레딧이 안 깎이고
//   · 예산 한도도 안 걸린다.
//
// 각 라우트가 20줄짜리 insert를 복붙하던 게 누락의 원인이므로, 여기 한 줄 호출로 줄인다.
// 실패해도 절대 던지지 않는다 — 사용량 기록 때문에 사용자 기능이 죽으면 안 된다.
import type { SupabaseClient } from "@supabase/supabase-js"
import { computeCostUsd, type CacheTokens } from "@/lib/pricing"
import { withWorkspace } from "@/lib/workspace"

/** 성공 호출 기록에 필요한 값. 토큰은 AI SDK `result.usage`에서 그대로 넘기면 된다. */
export type UsageRecord = {
  workspaceId: string | null
  userId: string
  model: string
  inputTokens: number | null | undefined
  outputTokens: number | null | undefined
  /** 시작 시각(Date.now()) — 소요시간 계산용. */
  startedAt: number
  /** 에이전트 대화에서 온 호출이면 지정(그 외 null). */
  agentId?: string | null
  /** 프롬프트 캐싱을 쓰는 라우트만. 안 쓰면 생략(전량 정가 계산). */
  cache?: CacheTokens
}

/**
 * 성공한 AI 호출 1건을 기록한다. `cost_usd`까지 여기서 계산해 라우트마다 달라지는 것을 막는다.
 *
 * ⚠️ 이 INSERT가 마이그133 트리거를 태워 **크레딧이 차감된다**. 즉 "기록한다 = 과금된다"이다.
 * 새 AI 라우트를 만들면 반드시 이 함수를 부를 것 — 안 부르면 그 기능은 조용히 무료가 된다.
 */
export async function recordAiUsage(
  supabase: SupabaseClient,
  r: UsageRecord
): Promise<void> {
  const inT = r.inputTokens ?? 0
  const outT = r.outputTokens ?? 0
  try {
    const { error } = await supabase.from("agent_usage").insert(
      withWorkspace(
        {
          agent_id: r.agentId ?? null,
          user_id: r.userId,
          tokens_input: inT,
          tokens_output: outT,
          cache_read_tokens: r.cache?.readTokens ?? 0,
          cache_write_tokens: r.cache?.writeTokens ?? 0,
          duration_ms: Date.now() - r.startedAt,
          success: true,
          model: r.model,
          cost_usd: computeCostUsd(r.model, inT, outT, r.cache),
        },
        r.workspaceId,
      ),
    )
    // 사용자 기능은 막지 않되(관측성 < 가용성) 조용히 사라지게는 두지 않는다.
    // 컬럼이 바뀌거나 RLS가 막히면 "전 라우트의 사용량이 통째로 유실"되는데, 그게 바로 이번에 고친 버그다.
    if (error) console.warn("[aiUsage] 기록 실패:", error.message, "| model:", r.model)
  } catch (e) {
    console.warn("[aiUsage] 기록 예외:", e instanceof Error ? e.message : String(e))
  }
}

/** 실패한 AI 호출 기록. 비용은 없지만 실패율을 봐야 장애를 안다. 트리거는 success=false를 차감하지 않는다. */
export async function recordAiFailure(
  supabase: SupabaseClient,
  r: Pick<UsageRecord, "workspaceId" | "userId" | "model" | "startedAt" | "agentId">,
  error: unknown
): Promise<void> {
  try {
    const { error: insErr } = await supabase.from("agent_usage").insert(
      withWorkspace(
        {
          agent_id: r.agentId ?? null,
          user_id: r.userId,
          duration_ms: Date.now() - r.startedAt,
          success: false,
          error_message: error instanceof Error ? error.message : String(error),
          model: r.model,
        },
        r.workspaceId,
      ),
    )
    if (insErr) console.warn("[aiUsage] 실패기록 실패:", insErr.message)
  } catch (e) {
    console.warn("[aiUsage] 실패기록 예외:", e instanceof Error ? e.message : String(e))
  }
}
