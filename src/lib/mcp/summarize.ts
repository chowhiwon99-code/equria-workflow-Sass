// MCP 도구의 (보통 영어·장문) 설명 → 비개발자용 한국어 한 줄 요약.
// 도구 발견 시 1회 생성해 캐시(mcp_user_connections.tools에 summaryKo로 저장). 실패해도 원본 그대로 반환(방어적).
import { generateObject } from "ai"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { anthropic, MODELS } from "@/lib/claude/client"
import { recordAiUsage } from "@/lib/aiUsage"
import type { DiscoveredTool } from "./connect"

const schema = z.object({
  items: z.array(z.object({ name: z.string(), ko: z.string() })),
})

/** 사용량 기록용 컨텍스트. 라이브러리라 supabase·유저를 직접 못 만들어 호출부가 넘긴다.
 *  생략하면 기록만 건너뛰고 요약은 그대로 동작한다(기존 호출부 호환). */
export type UsageContext = {
  supabase: SupabaseClient
  userId: string
  workspaceId: string | null
}

export async function summarizeToolsKo(
  connectorName: string,
  tools: DiscoveredTool[],
  usage?: UsageContext
): Promise<DiscoveredTool[]> {
  if (tools.length === 0) return tools
  const startedAt = Date.now()
  try {
    const list = tools
      .map((t, i) => `${i + 1}. ${t.name}: ${(t.description || "").replace(/\s+/g, " ").slice(0, 300)}`)
      .join("\n")
    const result = await generateObject({
      model: anthropic(MODELS.default),
      schema,
      system:
        "너는 외부 도구(MCP) 설명을 비개발자용 한국어 한 줄로 요약한다. 각 도구를 '무엇을 하는지' 30자 이내 쉬운 한국어 한 줄로. 도구명은 입력 그대로 두고, ko에만 요약을 넣어라.",
      prompt: `커넥터: ${connectorName}\n\n아래 각 도구를 한국어 한 줄로 요약해줘.\n${list}`,
      temperature: 0.2,
      maxOutputTokens: 2000,
    })
    // 세션44: 이 호출은 사용량 집계에서 빠져 있었다(도구 수만큼 입력이 붙어 작지 않다).
    if (usage) {
      await recordAiUsage(usage.supabase, {
        workspaceId: usage.workspaceId,
        userId: usage.userId,
        model: MODELS.default,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        startedAt,
      })
    }
    const map = new Map(result.object.items.map((p) => [p.name, p.ko]))
    return tools.map((t) => ({ ...t, summaryKo: map.get(t.name) ?? t.summaryKo }))
  } catch {
    return tools // 요약 실패 시 원본 유지(표시는 description으로 폴백)
  }
}
