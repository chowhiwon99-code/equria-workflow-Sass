// MCP 도구의 (보통 영어·장문) 설명 → 비개발자용 한국어 한 줄 요약.
// 도구 발견 시 1회 생성해 캐시(mcp_user_connections.tools에 summaryKo로 저장). 실패해도 원본 그대로 반환(방어적).
import { generateObject } from "ai"
import { z } from "zod"
import { anthropic } from "@/lib/claude/client"
import type { DiscoveredTool } from "./connect"

const schema = z.object({
  items: z.array(z.object({ name: z.string(), ko: z.string() })),
})

export async function summarizeToolsKo(
  connectorName: string,
  tools: DiscoveredTool[]
): Promise<DiscoveredTool[]> {
  if (tools.length === 0) return tools
  try {
    const list = tools
      .map((t, i) => `${i + 1}. ${t.name}: ${(t.description || "").replace(/\s+/g, " ").slice(0, 300)}`)
      .join("\n")
    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema,
      system:
        "너는 외부 도구(MCP) 설명을 비개발자용 한국어 한 줄로 요약한다. 각 도구를 '무엇을 하는지' 30자 이내 쉬운 한국어 한 줄로. 도구명은 입력 그대로 두고, ko에만 요약을 넣어라.",
      prompt: `커넥터: ${connectorName}\n\n아래 각 도구를 한국어 한 줄로 요약해줘.\n${list}`,
      temperature: 0.2,
      maxOutputTokens: 2000,
    })
    const map = new Map(object.items.map((p) => [p.name, p.ko]))
    return tools.map((t) => ({ ...t, summaryKo: map.get(t.name) ?? t.summaryKo }))
  } catch {
    return tools // 요약 실패 시 원본 유지(표시는 description으로 폴백)
  }
}
