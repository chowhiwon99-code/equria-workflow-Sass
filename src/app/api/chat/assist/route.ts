import { streamText } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"

export const maxDuration = 60
export const runtime = "nodejs"

/**
 * 채팅 AI 보조 — 작성 중인 메시지 초안을 다듬기/요약/번역해 스트리밍 반환.
 * 저장은 하지 않는다(미리보기 텍스트만). 클라이언트(ComposerAiAssist)가 토큰을 누적해
 * 미리보기 카드에 보여주고, 사용자가 [적용]할 때만 컴포저에 반영한다.
 * 출력은 항상 plain 텍스트(설명/따옴표 없이 본문만) — content=plain SSOT 정합.
 */

const ACTIONS = ["polish", "spellcheck", "summarize", "translate"] as const
type Action = (typeof ACTIONS)[number]

const LANGS = { ko: "한국어", en: "영어", zh: "중국어(간체)", ja: "일본어" } as const
type Lang = keyof typeof LANGS

/** 공통 출력 규율 — 모델이 군더더기 없이 결과 본문만 내도록 강제 */
const OUTPUT_RULE =
  "결과는 다듬은/번역한/요약한 메시지 본문만 출력하세요. " +
  "설명·머리말·따옴표·코드블록으로 감싸지 말고, 이모지나 인사말도 추가하지 마세요."

function systemFor(action: Action, lang?: Lang): string {
  switch (action) {
    case "polish":
      return (
        "당신은 한국 기업 내부 메신저의 글다듬기 도우미입니다. " +
        "입력 메시지의 의미는 그대로 두되, 더 자연스럽고 명확하며 정중한 동료 간 비즈니스 톤으로 다듬으세요. " +
        "원문에 쓰인 언어를 그대로 유지합니다. " +
        OUTPUT_RULE
      )
    case "spellcheck":
      return (
        "당신은 한국어 맞춤법·띄어쓰기·문법 교정기입니다. " +
        "입력 메시지에서 맞춤법, 띄어쓰기, 명백한 문법 오류만 바로잡으세요. " +
        "원래의 단어 선택·어조·문체·의미는 최대한 그대로 보존하고, 오류가 없는 부분은 절대 바꾸지 마세요. " +
        "문장을 새로 쓰거나 내용을 추가·삭제하지 마세요. " +
        OUTPUT_RULE
      )
    case "summarize":
      return (
        "당신은 메시지 요약 도우미입니다. 입력 메시지의 핵심 요점만 간결하게 한두 문장으로 요약하세요. " +
        "원문에 쓰인 언어를 그대로 유지합니다. " +
        OUTPUT_RULE
      )
    case "translate":
      return (
        `당신은 K-뷰티 업계 비즈니스 맥락에 능한 번역가입니다. 입력 메시지를 ${LANGS[lang ?? "en"]}로 ` +
        "자연스럽고 정중하게 번역하세요. 고유명사·브랜드명은 보존합니다. " +
        OUTPUT_RULE
      )
  }
}

const MAX_INPUT = 4000 // 메신저 초안 길이 가드(과금/지연 방지)

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as
    | { text?: unknown; action?: unknown; targetLang?: unknown }
    | null

  const text = typeof body?.text === "string" ? body.text.trim() : ""
  const action = body?.action as Action
  const targetLang = body?.targetLang as Lang | undefined

  if (!text) return new Response("Bad Request: empty text", { status: 400 })
  if (text.length > MAX_INPUT) return new Response("Bad Request: text too long", { status: 400 })
  if (!ACTIONS.includes(action)) return new Response("Bad Request: invalid action", { status: 400 })
  if (action === "translate" && targetLang && !(targetLang in LANGS)) {
    return new Response("Bad Request: invalid targetLang", { status: 400 })
  }

  // 교정(spellcheck)은 결정적이어야 해 낮은 temperature, 다듬기는 약간 높게
  const TEMP: Record<Action, number> = { polish: 0.4, spellcheck: 0.2, summarize: 0.3, translate: 0.3 }

  const result = streamText({
    model: anthropic(MODELS.default),
    system: systemFor(action, targetLang),
    prompt: text,
    temperature: TEMP[action],
    maxOutputTokens: 1500,
  })

  return result.toTextStreamResponse()
}
