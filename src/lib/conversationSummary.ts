// 대화 요약 압축(트랙2, 서버 전용) — HISTORY_WINDOW 밖으로 밀려난 오래된 턴을 Haiku로
// 압축 요약해 conversations.summary에 저장, 다음 턴부터 시스템 프롬프트에 주입한다.
// "질문하다 앞 내용 까먹음"의 정면 해결. 채팅 라우트 onFinish에서 백그라운드 호출(사용자 대기 0),
// 실패해도 채팅에 영향 없음(호출부 try/catch). 자동 기억 추출(agentMemoryExtract)과 동일 골격.
import { generateText, type UIMessage } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { computeCostUsd } from "@/lib/pricing"
import { withWorkspace } from "@/lib/workspace"
import type { createClient } from "@/lib/supabase/server"

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

/** 윈도우 밖 미요약 턴이 이만큼 쌓여야 갱신 — 매 턴 요약 호출을 막는 비용·지연 방어. */
export const SUMMARY_MIN_OVERFLOW = 4
/** 발화당 요약 입력 상한(과길이 방어). */
const TURN_CHAR_CAP = 600

const SUMMARY_SYSTEM = `너는 대화 압축 요약기다. 기존 요약과 새 대화 턴을 합쳐 "지금까지의 대화 요약"을 한국어로 갱신하라.
규칙:
- 이후 대화에서 다시 물어볼 만한 것을 남긴다: 핵심 사실·결정사항·이름·숫자·날짜·요청·미해결 항목.
- 인사말·잡담·중복은 버린다. 새 턴이 기존 요약과 모순되면 새 턴을 우선한다.
- 12줄 이내, 각 줄은 완결된 한 문장. 서론·결론 없이 요약 본문만 출력한다.`

/** 시스템 프롬프트 주입 블록. 요약이 없으면 빈 문자열. */
export function summaryBlock(summary: string | null | undefined): string {
  const s = summary?.trim()
  if (!s) return ""
  return `\n\n# 지금까지의 대화 요약(오래된 턴 압축)\n최근 메시지보다 앞선 대화의 맥락이다. 사용자가 앞서 말한 내용을 참조하면 이 요약을 근거로 답하라.\n${s}`
}

/** messages[from, to) 구간을 요약 입력 텍스트로 직렬화. */
export function turnsText(messages: UIMessage[], from: number, to: number): string {
  const lines: string[] = []
  for (const m of messages.slice(Math.max(0, from), Math.max(0, to))) {
    if (m.role !== "user" && m.role !== "assistant") continue
    const text = m.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n")
      .trim()
    if (text) lines.push(`${m.role === "user" ? "사용자" : "에이전트"}: ${text.slice(0, TURN_CHAR_CAP)}`)
  }
  return lines.join("\n")
}

/**
 * 요약 갱신(증분): 기존 요약 + 새로 밀려난 턴 → 갱신된 요약 저장 + summary_upto 전진.
 * AI 사용량은 agent_usage에 기록(비용 추적 일관성 — 요청 시점 checkBudget이 상위에서 게이트).
 */
export async function updateConversationSummary(
  supabase: SupabaseServer,
  opts: {
    conversationId: string
    agentId: string
    userId: string
    workspaceId: string | null
    prevSummary: string | null
    olderText: string
    newUpto: number
  },
): Promise<void> {
  if (!opts.olderText.trim()) return
  const startedAt = Date.now()
  const { text, usage } = await generateText({
    model: anthropic(MODELS.cheap),
    system: SUMMARY_SYSTEM,
    prompt: `기존 요약(없으면 비어 있음):\n${opts.prevSummary?.trim() || "(없음)"}\n\n새로 압축할 대화 턴:\n${opts.olderText}\n\n갱신된 요약:`,
    temperature: 0,
    maxOutputTokens: 700,
  })
  const summary = text.trim()
  if (!summary) return

  const inputTokens = usage.inputTokens ?? 0
  const outputTokens = usage.outputTokens ?? 0
  await Promise.all([
    supabase
      .from("conversations")
      .update({ summary, summary_upto: opts.newUpto })
      .eq("id", opts.conversationId),
    supabase.from("agent_usage").insert(
      withWorkspace(
        {
          agent_id: opts.agentId,
          user_id: opts.userId,
          conversation_id: opts.conversationId,
          tokens_input: inputTokens,
          tokens_output: outputTokens,
          duration_ms: Date.now() - startedAt,
          success: true,
          model: MODELS.cheap,
          cost_usd: computeCostUsd(MODELS.cheap, inputTokens, outputTokens),
        },
        opts.workspaceId,
      ),
    ),
  ])
}
