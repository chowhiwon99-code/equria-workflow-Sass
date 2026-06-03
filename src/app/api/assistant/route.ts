import { streamText, convertToModelMessages, type UIMessage } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"

export const maxDuration = 60
export const runtime = "nodejs"

const HISTORY_WINDOW = 12
const SYSTEM = `당신은 이큐리아(EQURIA) 워크스페이스의 AI 어시스턴트입니다.
이큐리아는 K-뷰티 브랜드이고, 이 워크스페이스는 직원 전용 사내 도구입니다.
직원의 업무(문서·아이디어·번역·요약·정리 등)를 한국어로 간결하고 정확하게 돕습니다.
모르는 것은 모른다고 솔직히 말하세요.`

/** 대시보드 일반 Claude 어시스턴트 — 특정 에이전트가 아닌 범용 채팅. (v1: 비저장/세션 한정) */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { messages?: UIMessage[] }
  const messages = body.messages ?? []
  const modelMessages = await convertToModelMessages(messages.slice(-HISTORY_WINDOW))

  const result = streamText({
    model: anthropic(MODELS.default),
    system: SYSTEM,
    messages: modelMessages,
    maxOutputTokens: 2048,
  })

  return result.toUIMessageStreamResponse()
}
