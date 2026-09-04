import { streamText } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { recordAiUsage } from "@/lib/aiUsage"
import { getUserWorkspaceId } from "@/lib/workspace"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"

export const maxDuration = 60
export const runtime = "nodejs"

/**
 * 메모 완성(Enhance) — 회의노트 대개편 P1 (Granola 패턴).
 * 회의 중 갈겨쓴 내 메모(notes)의 골격·표현을 유지한 채, 붙여넣은 전사(transcript)에서
 * 빠진 결정·수치·발언만 보강해 완성본을 스트리밍 반환한다. 자동 실행 없음 — 사용자가
 * 명시적으로 [메모 완성]을 눌렀을 때만(통제감이 이 패턴의 핵심). 저장하지 않는다(미리보기).
 * assist 라우트와 분리한 이유: 전사가 길어 입력 한도가 다르다(40,000자 vs 12,000자).
 */

const MAX_NOTES = 12000
const MAX_TRANSCRIPT = 40000 // 초과분은 클라이언트가 하드컷 후 안내

const SYSTEM =
  "당신은 회의 메모 완성 도우미입니다. 사용자가 회의 중 갈겨쓴 '내 메모'와 회의 '전사'가 주어집니다.\n" +
  "규칙:\n" +
  "1. 내 메모의 골격·순서·표현을 최대한 유지합니다. 메모가 곧 사용자의 판단이자 강조점입니다.\n" +
  "2. 전사에서만 확인되는 결정사항·수치·기한·발언을 메모의 알맞은 자리에 보강합니다.\n" +
  "3. 메모에도 전사에도 없는 내용은 절대 추가하지 마세요. 추측·창작 금지.\n" +
  "4. 중요한 보강에는 발언자를 (이름) 형태로 짧게 표기합니다.\n" +
  "5. 결과는 제목 없이 완성된 회의록 본문만 — 소제목(##)과 불릿(-)을 적절히 쓰되 과한 장식 금지, " +
  "이모지 금지, 담백한 실무 문체. 원문 언어 유지.\n" +
  "메모가 비어 있으면 전사만으로 '① 한 줄 요약 ② 논의 내용 ③ 결정사항 ④ 할 일' 구조로 정리하세요."

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const budget = await checkBudget(user.id, "interactive")
  if (!budget.ok) return new Response(budget.message ?? BUDGET_EXCEEDED_MSG, { status: 429 })

  const body = (await req.json().catch(() => null)) as { notes?: unknown; transcript?: unknown; meta?: unknown } | null
  const notes = typeof body?.notes === "string" ? body.notes.trim() : ""
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : ""
  const meta = typeof body?.meta === "string" ? body.meta.trim().slice(0, 300) : ""

  if (!transcript) return new Response("Bad Request: empty transcript", { status: 400 })
  if (notes.length > MAX_NOTES) return new Response("Bad Request: notes too long", { status: 400 })
  if (transcript.length > MAX_TRANSCRIPT) return new Response("Bad Request: transcript too long", { status: 400 })

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  const startedAt = Date.now()

  const prompt =
    (meta ? `[회의 정보] ${meta}\n\n` : "") +
    `[내 메모]\n${notes || "(비어 있음)"}\n\n[전사]\n${transcript}`

  const result = streamText({
    model: anthropic(MODELS.default),
    system: SYSTEM,
    prompt,
    temperature: 0.3,
    maxOutputTokens: 3000,
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
