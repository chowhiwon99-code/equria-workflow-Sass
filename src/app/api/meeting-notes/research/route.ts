import { generateText } from "ai"
import { anthropic, MODELS } from "@/lib/claude/client"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { computeCostUsd } from "@/lib/pricing"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * 회의/기획 리서치 (Part 2 · 2a) — 웹 검색으로 자료를 모으고 신뢰도(1·2차)로 걸러 카테고리로 정리.
 * Anthropic 웹서치 도구 사용. 콘솔에 web search 미활성/실패 시 → Claude 지식 폴백(최신성 한계 명시).
 * AI는 유료 기능(요금제 게이팅은 B1-b/요금제에서). 비용은 agent_usage에 best-effort 기록.
 */
const SYSTEM = `너는 회의·기획용 리서치 어시스턴트다. 주제에 대해 웹을 검색해 자료를 모으고 신뢰도로 걸러 정리한다.

절차:
1) 웹 검색으로 관련 자료를 여러 각도에서 수집.
2) 신뢰도 1차 — 주제 관련성으로 거른다.
3) 신뢰도 2차 — 출처 권위(공식·전문매체·학술 > 개인 블로그·익명)·최신성·교차검증으로 정밀하게 거른다.
4) 카테고리로 분류해 정리.

출력(한국어 마크다운):
- 맨 위 한 줄 요약.
- 카테고리를 ## 제목으로, 핵심 항목을 불릿으로. 각 항목 끝에 신뢰도 [높음]/[보통]/[낮음] 표기.
- 마지막에 "## 출처" 섹션에 주요 출처를 나열(있으면 링크).
- 불확실·미검증은 명시. 추측을 사실처럼 쓰지 마라.`

type Src = { url: string; title?: string }

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json().catch(() => null)) as { query?: unknown; context?: unknown; prior?: unknown } | null
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 2000) : ""
  const context = typeof body?.context === "string" ? body.context.slice(0, 4000) : ""
  const prior = typeof body?.prior === "string" ? body.prior.slice(0, 8000) : ""
  if (!query) return new Response("Bad Request", { status: 400 })

  // 대화형 — 이전 정리본이 있으면 그 위에 후속 요청을 반영해 고도화.
  const prompt = prior
    ? `지금까지 정리한 리서치:\n${prior}\n\n사용자 후속 요청: ${query}\n\n위 정리본을 이 요청에 맞춰 보강·갱신한 새 정리본 전체를 작성하라(누락 없이, 더 깊고 정교하게).`
    : context
      ? `리서치 주제: ${query}\n\n참고(현재 회의노트 일부):\n${context}`
      : `리서치 주제: ${query}`
  const started = Date.now()

  let text = ""
  let sources: Src[] = []
  let searched = true
  let inputTokens = 0
  let outputTokens = 0

  const collectSources = (raw: unknown): Src[] => {
    if (!Array.isArray(raw)) return []
    const out: Src[] = []
    for (const s of raw) {
      const o = s as { url?: unknown; title?: unknown }
      if (typeof o.url === "string") out.push({ url: o.url, title: typeof o.title === "string" ? o.title : undefined })
    }
    return out
  }

  try {
    const result = await generateText({
      model: anthropic(MODELS.default),
      system: SYSTEM,
      prompt,
      tools: {
        web_search: anthropic.tools.webSearch_20250305({
          maxUses: 3,
          userLocation: { type: "approximate", country: "KR", timezone: "Asia/Seoul" },
        }),
      },
      maxOutputTokens: 1800,
      temperature: 0.4,
    })
    text = result.text
    sources = collectSources(result.sources)
    inputTokens = result.usage.inputTokens ?? 0
    outputTokens = result.usage.outputTokens ?? 0
  } catch (e) {
    // 웹서치 미활성/실패/시간초과 → Claude 지식 폴백
    console.error("[research] web_search 실패, 폴백:", e instanceof Error ? e.message : e)
    searched = false
    try {
      const result = await generateText({
        model: anthropic(MODELS.default),
        system: `${SYSTEM}\n\n⚠️ 웹 검색을 쓸 수 없다. 학습된 지식으로 정리하되, 최신성·정확성에 한계가 있음을 맨 위에 1줄로 명시하라.`,
        prompt,
        maxOutputTokens: 1800,
        temperature: 0.4,
      })
      text = result.text
      inputTokens = result.usage.inputTokens ?? 0
      outputTokens = result.usage.outputTokens ?? 0
    } catch (e2) {
      console.error("[research] 폴백도 실패:", e2 instanceof Error ? e2.message : e2)
      return Response.json({ error: "리서치 생성에 실패했어요." }, { status: 500 })
    }
  }

  // 비용 기록 (best-effort — 실패해도 결과는 반환)
  try {
    const admin = createAdminClient()
    await admin.from("agent_usage").insert({
      user_id: user.id,
      tokens_input: inputTokens,
      tokens_output: outputTokens,
      duration_ms: Date.now() - started,
      success: true,
      model: MODELS.default,
      cost_usd: computeCostUsd(MODELS.default, inputTokens, outputTokens),
    })
  } catch {
    /* 비용 기록 실패 무시 */
  }

  return Response.json({ text, sources, searched })
}
