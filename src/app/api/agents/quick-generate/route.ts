import { NextResponse } from "next/server"
import { generateObject } from "ai"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { anthropic, MODELS } from "@/lib/claude/client"
import { SKILL_MD_SYSTEM } from "@/lib/agentBuilder"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"
import { getUserWorkspaceId, withWorkspace } from "@/lib/workspace"

export const runtime = "nodejs"
export const maxDuration = 60

const quickAgentSchema = z.object({
  name: z.string().describe("간결한 에이전트 이름(한국어, 12자 내외). 예: '거래처 메일 비서'"),
  icon: z.string().describe("이 에이전트를 대표하는 이모지 1개. 예: ✉️ 🧾 📊"),
  category: z.enum(["document", "content", "cs", "analytics", "translation", "tax", "legal", "custom"]).describe("가장 가까운 분류"),
  system_prompt: z.string().describe("SKILL_MD_SYSTEM 규칙을 따른 완성형 skill.md 시스템 프롬프트(마크다운, # 이름으로 시작, 모든 섹션 채움)"),
})

/**
 * 한 줄 → 즉시 완성(세션41 대표 확정) — 사용자의 한 줄 목적으로 에이전트 초안 전체를 한 번에 생성.
 * 이름·아이콘·분류·시스템프롬프트를 구조화 반환 → 클라가 편집 가능한 미리보기 폼에 프리필. 저장은 폼에서.
 * body: { purpose: string, refine?: string(수정 요청) }
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const budget = await checkBudget(user.id)
  if (!budget.ok) return NextResponse.json({ error: BUDGET_EXCEEDED_MSG }, { status: 429 })

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  if (!workspaceId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { purpose?: string; refine?: string } | null
  const purpose = (body?.purpose ?? "").trim()
  if (!purpose) return NextResponse.json({ error: "무엇을 맡길지 한 줄 적어주세요." }, { status: 400 })
  const refine = (body?.refine ?? "").trim()

  const prompt = [
    `사용자가 만들고 싶은 에이전트(한 줄): "${purpose}"`,
    refine ? `\n사용자 수정 요청(가장 우선 반영): "${refine}"` : "",
    "\n이 목적에 맞는 에이전트의 이름·이모지·분류·완성형 skill.md 시스템 프롬프트를 만들어주세요.",
    "정보가 부족한 부분은 목적·직무 맥락에서 합리적으로 추론하되, 없는 도구·데이터를 지어내지 마세요.",
  ].join("\n")

  const startedAt = Date.now()
  try {
    const result = await generateObject({
      model: anthropic(MODELS.default),
      schema: quickAgentSchema,
      system: SKILL_MD_SYSTEM,
      prompt,
      temperature: 0.4,
    })
    const inT = result.usage.inputTokens ?? 0
    const outT = result.usage.outputTokens ?? 0
    const { error: usageErr } = await supabase.from("agent_usage").insert(
      withWorkspace(
        { user_id: user.id, tokens_input: inT, tokens_output: outT, duration_ms: Date.now() - startedAt, success: true, model: MODELS.default, cost_usd: computeCostUsd(MODELS.default, inT, outT) },
        workspaceId,
      ),
    )
    if (usageErr) console.error("quick-generate usage insert failed:", usageErr.message)
    return NextResponse.json({ draft: result.object })
  } catch (e) {
    const { error: usageErr } = await supabase.from("agent_usage").insert(
      withWorkspace(
        { user_id: user.id, duration_ms: Date.now() - startedAt, success: false, error_message: e instanceof Error ? e.message : String(e), model: MODELS.default },
        workspaceId,
      ),
    )
    if (usageErr) console.error("quick-generate usage insert failed:", usageErr.message)
    return NextResponse.json({ error: "에이전트 초안 생성에 실패했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 })
  }
}
