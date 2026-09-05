import { generateObject } from "ai"
import { z } from "zod"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { recordAiUsage } from "@/lib/aiUsage"
import { getUserWorkspaceId } from "@/lib/workspace"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"

export const maxDuration = 45
export const runtime = "nodejs"

/**
 * 액션아이템 추출 — 회의노트 대개편 P3. 본문·전사에서 '담당자·할 일·기한'을 구조화해 돌려준다.
 * 저장은 하지 않는다 — 클라이언트(ActionItemsSheet)가 담당자 매칭을 확인시킨 뒤 저장한다.
 * (AI가 사람 이름을 직접 계정에 매칭해 남의 할 일을 만드는 건 위험 — 사람이 한 번 본다.)
 */

const MAX_INPUT = 24000

const schema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().max(200).describe("할 일 한 줄(동사로 끝나는 실행 문장)"),
        assignee_name: z.string().max(40).nullable().describe("본문에 적힌 담당자 이름 그대로. 없으면 null"),
        due_date: z.string().max(20).nullable().describe("YYYY-MM-DD. 본문에 명시된 경우만, 없으면 null"),
      }),
    )
    .max(15),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const budget = await checkBudget(user.id, "interactive")
  if (!budget.ok) return new Response(budget.message ?? BUDGET_EXCEEDED_MSG, { status: 429 })

  const body = (await req.json().catch(() => null)) as { text?: unknown; today?: unknown } | null
  const text = typeof body?.text === "string" ? body.text.trim() : ""
  const today = typeof body?.today === "string" ? body.today.slice(0, 10) : ""
  if (!text) return new Response("Bad Request: empty text", { status: 400 })
  if (text.length > MAX_INPUT) return new Response("Bad Request: text too long", { status: 400 })

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  const startedAt = Date.now()

  try {
    const { object, usage } = await generateObject({
      model: anthropic(MODELS.default),
      schema,
      system:
        "회의록에서 실행해야 할 일(액션아이템)만 뽑는 도우미입니다. " +
        "회의에서 실제로 하기로 한 것만 추출하고, 논의·의견·배경 설명은 제외하세요. " +
        "담당자와 기한은 본문에 적힌 경우에만 채우고 추측하지 마세요. 없으면 null입니다. " +
        (today ? `상대 표현(다음 주, 이번 주 금요일 등)은 오늘(${today}) 기준으로 YYYY-MM-DD로 환산하세요.` : "") +
        " 할 일이 없으면 빈 배열을 반환하세요.",
      prompt: text,
      temperature: 0,
    })
    await recordAiUsage(supabase, {
      workspaceId,
      userId: user.id,
      model: MODELS.default,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      startedAt,
    })
    return Response.json({ items: object.items })
  } catch {
    return new Response("추출에 실패했어요.", { status: 500 })
  }
}
