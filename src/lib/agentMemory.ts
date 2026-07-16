// 에이전트 학습·기억(v1) — 순수 헬퍼(클라/서버 공용, 외부 의존성 없음).
// 저장은 다 하되(로그처럼), 대화에는 "관련된 소수만" 주입한다(지금은 최근 것 위주). 상세 = AGENTS-LEARNING-DESIGN.md §9.

export type AgentMemoryKind = "fact" | "preference" | "style" | "correction"

export const MEMORY_KINDS: readonly AgentMemoryKind[] = ["fact", "preference", "style", "correction"] as const

export const MEMORY_KIND_LABEL: Record<AgentMemoryKind, string> = {
  fact: "사실",
  preference: "선호",
  style: "말투",
  correction: "교정",
}

export function isMemoryKind(v: unknown): v is AgentMemoryKind {
  return typeof v === "string" && (MEMORY_KINDS as readonly string[]).includes(v)
}

export type MemoryLite = { kind: string; content: string }

// 활성 기억들을 시스템 프롬프트에 붙일 블록으로 직렬화. 비면 빈 문자열(주입 스킵).
export function buildMemoryBlock(memories: MemoryLite[]): string {
  if (!memories.length) return ""
  const lines = memories.map((m) => {
    const label = MEMORY_KIND_LABEL[m.kind as AgentMemoryKind] ?? "메모"
    return `- (${label}) ${m.content}`
  })
  return (
    `\n\n# 이 사용자에 대해 기억할 것(학습됨)\n` +
    `이 사용자와의 지난 작업에서 배운 점입니다. 자연스럽게 반영하되, ` +
    `이번 대화에서 사용자가 명시적으로 다르게 지시하면 새 지시를 우선하세요.\n\n` +
    lines.join("\n")
  )
}
