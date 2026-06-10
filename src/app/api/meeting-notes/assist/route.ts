import { streamText } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"

export const maxDuration = 60
export const runtime = "nodejs"

/**
 * 회의 노트 AI 보조 — 작성 중인 회의록을 요약/액션아이템 추출/정리해 스트리밍 반환.
 * 저장하지 않는다(미리보기 텍스트만). 클라이언트(MeetingAiAssist)가 토큰을 누적해
 * 미리보기로 보여주고, 사용자가 [본문에 추가]/[전체 교체]할 때만 본문에 반영한다.
 * 출력은 항상 plain 텍스트(설명/머리말 없이 본문만).
 */

const ACTIONS = ["summarize", "actions", "polish"] as const
type Action = (typeof ACTIONS)[number]

const OUTPUT_RULE =
  "결과 본문만 출력하세요. 설명·머리말·따옴표·코드블록으로 감싸지 말고, 인사말이나 군더더기를 붙이지 마세요."

function systemFor(action: Action): string {
  switch (action) {
    case "summarize":
      return (
        "당신은 회의록 요약 도우미입니다. 입력된 회의 노트의 핵심 결정사항과 논의 요점을 " +
        "불릿(•)로 간결하게 정리하세요. 원문 언어를 유지합니다. " +
        OUTPUT_RULE
      )
    case "actions":
      return (
        "당신은 회의록에서 액션아이템을 뽑아내는 도우미입니다. 입력된 회의 노트에서 " +
        "'담당자 · 할 일 · 기한'을 추출해 한 줄에 하나씩 '- [담당자] 할 일 (기한)' 형식으로 정리하세요. " +
        "노트에 명시되지 않은 항목은 만들지 말고, 기한이 없으면 (기한 미정)으로 표기하세요. " +
        "원문 언어를 유지합니다. " +
        OUTPUT_RULE
      )
    case "polish":
      return (
        "당신은 회의록 정리 도우미입니다. 입력된 거친 메모를 의미는 그대로 두고 " +
        "읽기 좋은 회의록으로 다듬으세요. 자연스럽게 항목을 묶고 군더더기를 없애되 내용을 추가·삭제하지 마세요. " +
        "원문 언어를 유지합니다. " +
        OUTPUT_RULE
      )
  }
}

const MAX_INPUT = 12000 // 회의록 길이 가드(과금/지연 방지)

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as { text?: unknown; action?: unknown } | null
  const text = typeof body?.text === "string" ? body.text.trim() : ""
  const action = body?.action as Action

  if (!text) return new Response("Bad Request: empty text", { status: 400 })
  if (text.length > MAX_INPUT) return new Response("Bad Request: text too long", { status: 400 })
  if (!ACTIONS.includes(action)) return new Response("Bad Request: invalid action", { status: 400 })

  const result = streamText({
    model: anthropic(MODELS.default),
    system: systemFor(action),
    prompt: text,
    temperature: 0.3,
    maxOutputTokens: 2000,
  })

  return result.toTextStreamResponse()
}
