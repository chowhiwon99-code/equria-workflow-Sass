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
 * 결정 추출 — 결정 인프라 Unit A. 회의록(또는 붙여넣은 대화)에서 **합의된 결정**과 **미결 질문**을 뽑는다.
 * 저장하지 않는다 — 사람이 승인 카드에서 체크 1번으로 원장에 넣는다(등록 폼 0개 원칙).
 *
 * 🔴 오탐이 원장에 들어가면 결정 온도계가 거짓말을 하고 제품이 죽는다. 그래서:
 *   - "논의했다"와 "정했다"를 구분하도록 프롬프트에 못박음
 *   - 근거 발췌(excerpt)가 없으면 클라이언트가 드롭
 *   - confidence < 0.7이면 승인 카드에서 체크가 꺼진 채 렌더된다
 * mode='chat'이면 카카오톡 등 대화 로그 — 잡담 비율이 높아 기준을 더 높인다(Unit C).
 */

const MAX_INPUT = 24000

const schema = z.object({
  decisions: z
    .array(
      z.object({
        kind: z.enum(["decision", "open_question"]).describe("합의된 결정이면 decision, 결론 없이 남은 쟁점이면 open_question"),
        statement: z.string().max(300).describe("한 문장으로 완결된 결정문(대상 + 내용). 예: '리필 파우치 구독가를 월 9,900원으로 한다'"),
        detail: z.string().max(500).nullable().describe("조건·전제·배경(있을 때만)"),
        topic: z.array(z.string().max(16)).max(4).describe("정규화 태그 1~4개(명사형). 나중에 같은 주제의 과거 결정을 찾는 열쇠"),
        owner_name: z.string().max(40).nullable().describe("본문에 적힌 책임자 이름 그대로. 없으면 null"),
        excerpt: z.string().max(200).describe("이 판단의 근거가 된 원문 발췌(그대로 인용, 200자 이내)"),
        confidence: z.number().min(0).max(1).describe("정말 '정해진 것'이라는 확신(0~1). 논의만 된 것은 0.5 미만"),
      }),
    )
    .max(10),
})

const SYSTEM_MEETING =
  "회의록에서 **결정**과 **미결 쟁점**만 뽑는 도우미입니다.\n" +
  "규칙:\n" +
  "1. '정했다/하기로 했다/확정' 같은 합의 표현이 있는 것만 decision입니다. 논의·의견·아이디어는 제외하세요.\n" +
  "2. 결론이 안 난 쟁점(다음에 정하기로 한 것)은 kind='open_question'으로 뽑습니다.\n" +
  "3. statement는 **대상과 내용이 완결된 한 문장**이어야 합니다. 대상을 특정할 수 없으면 아예 뽑지 마세요.\n" +
  "4. excerpt는 반드시 원문에 있는 문장을 그대로 인용하세요. 지어내면 안 됩니다.\n" +
  "5. 실행 단위(누가 언제까지 무엇을 한다)는 '할 일'이지 결정이 아닙니다 — 여기서 제외하세요.\n" +
  "6. 없으면 빈 배열을 반환하세요. 억지로 채우지 마세요."

const SYSTEM_CHAT =
  SYSTEM_MEETING +
  "\n\n이 입력은 메신저 대화 로그입니다. 잡담·인사·이모티콘 반응이 많으니 기준을 더 높이세요.\n" +
  "'ㅇㅋ', '넵'처럼 무엇에 동의했는지 대화에서 특정할 수 없으면 뽑지 마세요.\n" +
  "🔴 개인 신상·건강·금전 거래·인사 평가·급여에 관한 내용은 어떤 형태로도 추출하지 마세요."

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const budget = await checkBudget(user.id, "interactive")
  if (!budget.ok) return new Response(budget.message ?? BUDGET_EXCEEDED_MSG, { status: 429 })

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  if (!workspaceId) return new Response("Forbidden", { status: 403 })

  const body = (await req.json().catch(() => null)) as { text?: unknown; mode?: unknown; today?: unknown } | null
  const text = typeof body?.text === "string" ? body.text.trim() : ""
  const mode = body?.mode === "chat" ? "chat" : "meeting"
  const today = typeof body?.today === "string" ? body.today.slice(0, 10) : ""
  if (!text) return new Response("Bad Request: empty text", { status: 400 })
  if (text.length > MAX_INPUT) return new Response("Bad Request: text too long", { status: 400 })

  const startedAt = Date.now()

  try {
    const { object, usage } = await generateObject({
      model: anthropic(MODELS.default),
      schema,
      system: (mode === "chat" ? SYSTEM_CHAT : SYSTEM_MEETING) + (today ? `\n오늘은 ${today}입니다.` : ""),
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
    // 근거 발췌가 없는 항목은 서버에서 버린다 — 원장 오염 방지의 1차 방어선
    const decisions = object.decisions.filter((d) => d.statement.trim() && d.excerpt.trim())
    return Response.json({ decisions })
  } catch {
    return new Response("결정을 뽑지 못했어요.", { status: 500 })
  }
}
