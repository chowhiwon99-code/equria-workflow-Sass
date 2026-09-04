import { streamText } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { recordAiUsage } from "@/lib/aiUsage"
import { getUserWorkspaceId } from "@/lib/workspace"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"
import { SKILL_MD_SYSTEM, serializeInputs, type WizardInputs } from "@/lib/agentBuilder"

export const maxDuration = 60
export const runtime = "nodejs"

/**
 * 가이드형 빌더 — 구조화 입력 → skill.md 시스템 프롬프트를 스트리밍 생성.
 * 저장(agents/agent_versions)은 하지 않는다(미리보기 텍스트만 반환).
 * 텍스트 스트림으로 응답 → 클라이언트는 textarea 에 토큰을 누적한다.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  // 예산 게이트 — interview·assistant 등 다른 AI 라우트와 동일 패턴(세션52 발견분: 이 라우트만 누락돼 있었다).
  const budget = await checkBudget(user.id, "interactive")
  if (!budget.ok) return new Response(budget.message ?? BUDGET_EXCEEDED_MSG, { status: 429 })

  const body = (await req.json().catch(() => null)) as {
    inputs?: WizardInputs
    clarifications?: string
  } | null
  const inputs = body?.inputs
  if (!inputs || typeof inputs !== "object") {
    return new Response("Bad Request", { status: 400 })
  }

  // 인터뷰 되물음 답변(있으면) — 메타프롬프트가 "가장 우선하는 근거"로 삼는다(SKILL_MD_SYSTEM 규칙 8).
  const clarifications = (body?.clarifications ?? "").trim()
  const clarifyBlock = clarifications
    ? `\n\n## 사용자 추가 답변(인터뷰)\n${clarifications}`
    : ""

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  const startedAt = Date.now()

  const result = streamText({
    // 하드코딩된 모델 문자열이었다 → MODELS.default(같은 값). 기본 모델이 바뀌어도 같이 따라간다.
    model: anthropic(MODELS.default),
    system: SKILL_MD_SYSTEM,
    prompt: `다음 입력을 바탕으로 skill.md 시스템 프롬프트를 작성하세요.\n\n${serializeInputs(inputs)}${clarifyBlock}`,
    temperature: 0.4,
    maxOutputTokens: 2000,
    // 스트리밍이라 끝나야 토큰 수를 안다 → onFinish에서 기록(세션44: 집계에서 빠져 있던 라우트).
    onFinish: async ({ usage }) => {
      await recordAiUsage(supabase, {
        workspaceId,
        userId: user.id,
        model: MODELS.default,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        startedAt,
      })
    },
  })

  // 클라이언트가 끊겨도 서버가 끝까지 소비해 onFinish(기록)가 실행되게 한다.
  void result.consumeStream({ onError: () => {} })

  return result.toTextStreamResponse()
}
