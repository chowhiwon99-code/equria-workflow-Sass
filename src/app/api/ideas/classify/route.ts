import { generateObject } from "ai"
import { z } from "zod"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { recordAiUsage } from "@/lib/aiUsage"
import { getUserWorkspaceId } from "@/lib/workspace"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"

export const maxDuration = 30
export const runtime = "nodejs"

/**
 * 아이디어 자동 분류 — 회의노트 대개편 P1 (MyMind 패턴: "저장만 해라, 정리는 AI가").
 * 캡처 직후 클라이언트가 fire-and-forget으로 호출 — 태그 3개를 뽑아 ideas.tags에 기록한다.
 * 실패해도 아이디어는 이미 저장돼 있다(태그만 빈 채로 남음 — 치명적이지 않음).
 * Haiku(cheap) 사용 — 백그라운드 경량 작업(기억 추출과 동일 티어).
 */

const schema = z.object({
  tags: z.array(z.string().max(12)).max(3).describe("아이디어를 분류하는 짧은 한국어 태그 1~3개(명사형, 예: 마케팅, 원가절감, 신제품)"),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const budget = await checkBudget(user.id, "interactive")
  if (!budget.ok) return new Response(budget.message ?? BUDGET_EXCEEDED_MSG, { status: 429 })

  const body = (await req.json().catch(() => null)) as { ideaId?: unknown } | null
  const ideaId = typeof body?.ideaId === "string" ? body.ideaId : ""
  if (!ideaId) return new Response("Bad Request", { status: 400 })

  // RLS(ideas_select)가 워크스페이스 격리를 강제 — 남의 아이디어 id로는 행이 안 나온다.
  const { data: idea } = await supabase.from("ideas").select("id, title, body").eq("id", ideaId).maybeSingle()
  if (!idea) return new Response("Not Found", { status: 404 })

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  const startedAt = Date.now()

  try {
    const { object, usage } = await generateObject({
      model: anthropic(MODELS.cheap),
      schema,
      prompt:
        `다음 업무 아이디어에 분류 태그를 붙이세요.\n제목: ${idea.title.slice(0, 200)}\n내용: ${(idea.body ?? "").slice(0, 1000)}`,
      temperature: 0,
    })
    const tags = object.tags.map((t) => t.trim()).filter(Boolean).slice(0, 3)
    // update는 RLS(ideas_update = 멤버 전원) 통과
    await supabase.from("ideas").update({ tags, updated_at: new Date().toISOString() }).eq("id", ideaId)
    await recordAiUsage(supabase, {
      workspaceId,
      userId: user.id,
      model: MODELS.cheap,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      startedAt,
    })
    return Response.json({ tags })
  } catch {
    // 분류 실패는 조용히 — 아이디어 자체는 이미 저장됨
    return Response.json({ tags: [] })
  }
}
