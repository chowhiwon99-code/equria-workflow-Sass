// 에이전트 자동 기억 추출(v2, 서버 전용) — 대화가 쌓이면 요점을 뽑아 agent_memories에 저장.
// 채팅 라우트 onFinish에서 백그라운드로 호출된다(사용자 대기시간 0). 실패해도 채팅에 영향 없음(호출부 try/catch).
// v1(수동 '기억해두기') 위에 얹는 자동 루프. 저렴 모델(Haiku)로, 기존 기억과 중복은 2중 방어. 상세 = AGENTS-LEARNING-DESIGN.md §9.
import { generateObject } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { memoryExtractionSchema } from "@/lib/claude/schemas"
import { computeCostUsd } from "@/lib/pricing"
import { withWorkspace } from "@/lib/workspace"
import {
  EXTRACTION_SYSTEM,
  buildExtractionPrompt,
  dedupeCandidates,
  type ExtractTurn,
} from "@/lib/agentMemory"
import type { createClient } from "@/lib/supabase/server"

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

// 프롬프트 크기 방어: 기존 기억은 최근 40개까지만 비교용으로 주입.
const EXISTING_LIMIT = 40

/**
 * 최근 대화 턴에서 오래 기억할 사용자 정보를 추출해 저장한다.
 * - 기존 활성 기억(본인 것만·RLS)을 프롬프트에 넣어 중복 생성을 억제.
 * - Haiku로 generateObject → 후보를 코드에서 다시 정규화 dedup → 신규만 insert.
 * - AI 사용량은 agent_usage에 기록(성공/실패 모두), 비용 추적·예산 반영.
 */
export async function extractAndStoreMemories(
  supabase: SupabaseServer,
  opts: {
    agentId: string
    userId: string
    conversationId: string
    workspaceId: string | null
    turns: ExtractTurn[]
  },
): Promise<void> {
  if (opts.turns.length === 0) return

  // 기존 활성 기억(비교용). RLS가 "본인 것만"을 강제.
  const { data: existingRows } = await supabase
    .from("agent_memories")
    .select("content")
    .eq("agent_id", opts.agentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(EXISTING_LIMIT)
  const existing = (existingRows ?? []).map((r) => r.content)

  const startedAt = Date.now()
  let candidates: { kind: string; content: string; importance?: number }[] = []
  try {
    const result = await generateObject({
      model: anthropic(MODELS.cheap),
      schema: memoryExtractionSchema,
      system: EXTRACTION_SYSTEM,
      prompt: buildExtractionPrompt(opts.turns, existing),
      temperature: 0,
    })
    candidates = result.object.memories
    const inT = result.usage.inputTokens ?? 0
    const outT = result.usage.outputTokens ?? 0
    await supabase.from("agent_usage").insert(
      withWorkspace(
        {
          agent_id: opts.agentId,
          user_id: opts.userId,
          conversation_id: opts.conversationId,
          tokens_input: inT,
          tokens_output: outT,
          duration_ms: Date.now() - startedAt,
          success: true,
          model: MODELS.cheap,
          cost_usd: computeCostUsd(MODELS.cheap, inT, outT),
        },
        opts.workspaceId,
      ),
    )
  } catch (e) {
    // 실패 사용량 기록(관측성) — 코칭/어시스턴트 라우트와 동일 패턴. 채팅엔 영향 없음.
    await supabase.from("agent_usage").insert(
      withWorkspace(
        {
          agent_id: opts.agentId,
          user_id: opts.userId,
          conversation_id: opts.conversationId,
          duration_ms: Date.now() - startedAt,
          success: false,
          error_message: e instanceof Error ? e.message : String(e),
          model: MODELS.cheap,
        },
        opts.workspaceId,
      ),
    )
    return
  }

  const fresh = dedupeCandidates(candidates, existing)
  if (fresh.length === 0) return

  // agent_memories는 개인용(워크스페이스 컬럼 없음·099) → withWorkspace 미사용. RLS=본인만.
  await supabase.from("agent_memories").insert(
    fresh.map((m) => ({
      agent_id: opts.agentId,
      user_id: opts.userId,
      kind: m.kind,
      content: m.content,
      importance: m.importance, // 자동추출이 매긴 중요도(중요도순 주입에 반영)
      source_conversation_id: opts.conversationId,
    })),
  )
}
