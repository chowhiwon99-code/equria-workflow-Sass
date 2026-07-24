import { streamText } from "ai"
import { anthropic } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
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

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: SKILL_MD_SYSTEM,
    prompt: `다음 입력을 바탕으로 skill.md 시스템 프롬프트를 작성하세요.\n\n${serializeInputs(inputs)}${clarifyBlock}`,
    temperature: 0.4,
    maxOutputTokens: 2000,
  })

  return result.toTextStreamResponse()
}
