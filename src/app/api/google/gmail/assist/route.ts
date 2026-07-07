import { streamText } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"

export const maxDuration = 60
export const runtime = "nodejs"

/**
 * 메일 작성 AI 보조 — 초안/요점을 회사 격식 메일로 완성·정중히 다듬기·간결화·번역해 스트리밍.
 * 저장하지 않음(미리보기). 클라이언트(MailAiAssist)가 누적→[적용] 시에만 본문 반영(원문 보존).
 * ⚠️ 규칙은 지금 하드코딩. 추후 "회사 메일 에이전트"(agent_versions.system_prompt)로 회사별 커스터마이징 예정.
 */

const ACTIONS = ["formal", "casual", "concise", "translate"] as const
type Action = (typeof ACTIONS)[number]
const LANGS = { ko: "한국어", en: "영어", zh: "중국어(간체)", ja: "일본어" } as const
type Lang = keyof typeof LANGS

// AI 티 금지 — 사람이 쓴 담백한 실무 메일. (대표 핵심 요구)
const OUTPUT_RULE =
  "결과는 메일 본문만 출력하세요(제목·설명·따옴표·코드블록·머리말 없이). " +
  "이모지·이모티콘은 절대 쓰지 마세요. 사람이 쓴 것처럼 담백하고 자연스러운 실무 메일 문체로 쓰되, " +
  "'물론입니다'류 군더더기·과장 표현·과한 강조·줄표(—) 장식은 넣지 마세요."

// 한국 회사 비즈니스 메일 예의.
const ETIQUETTE =
  "한국 회사의 비즈니스 이메일 예의를 지키세요: 자연스러운 인사말로 시작하고(예: '안녕하세요.'), " +
  "존댓말과 정중한 격식체로 요점을 명확히 전달하며, 정중한 맺음말로 끝맺으세요(예: '감사합니다.'). " +
  "받는 사람 이름·회사가 주어지지 않으면 '[받는 분]' 같은 자리표시자를 만들지 말고 무난한 일반 인사로 시작하세요."

function systemFor(action: Action, lang?: Lang): string {
  switch (action) {
    case "formal":
      return (
        "당신은 한국 회사의 이메일 작성 도우미입니다. 입력된 초안이나 요점을 회사에서 통용되는 격식 있는 " +
        "비즈니스 이메일로 완성하세요. 사실 관계는 바꾸지 말고, 빠진 인사말·존댓말·맺음말을 갖춘 완결된 메일로 다듬으세요. " +
        ETIQUETTE +
        " " +
        OUTPUT_RULE
      )
    case "casual":
      return (
        "당신은 이메일 톤 변환 도우미입니다. 입력된 초안이나 메일을 예의는 지키되 부드럽고 친근한 톤의 " +
        "이메일로 작성하세요. 지나치게 딱딱한 격식은 덜고 따뜻하고 편안하게 하되, 존댓말과 기본 예의는 유지하고 " +
        "반말·과한 구어체는 쓰지 마세요. 사실 관계는 바꾸지 말고 자연스러운 인사와 맺음말을 갖추세요. 원문 언어를 유지합니다. " +
        OUTPUT_RULE
      )
    case "concise":
      return (
        "당신은 이메일 간결화 도우미입니다. 입력 메일의 핵심과 정중함은 유지하되 불필요한 말을 덜어 " +
        "간결하고 명확하게 정리하세요. 원문 언어를 유지합니다. " +
        OUTPUT_RULE
      )
    case "translate":
      return (
        `당신은 비즈니스 이메일 번역가입니다. 입력 메일을 ${LANGS[lang ?? "en"]}로 정중하고 자연스러운 ` +
        "비즈니스 톤으로 번역하세요. 고유명사·브랜드명은 보존합니다. " +
        OUTPUT_RULE
      )
  }
}

const MAX_INPUT = 8000

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

  const TEMP: Record<Action, number> = { formal: 0.4, casual: 0.5, concise: 0.3, translate: 0.3 }

  const result = streamText({
    model: anthropic(MODELS.default),
    system: systemFor(action, targetLang),
    prompt: text,
    temperature: TEMP[action],
    maxOutputTokens: 2000,
  })

  return result.toTextStreamResponse()
}
