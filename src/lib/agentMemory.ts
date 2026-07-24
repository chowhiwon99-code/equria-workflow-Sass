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

// 자동 추출용 한 턴(사용자/에이전트 발화).
export type ExtractTurn = { role: "user" | "assistant"; text: string }

// 중복 판정용 정규화: 소문자·공백 축약·끝문장부호 제거. 같은 뜻의 문장을 같은 키로.
export function normalizeMemoryContent(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.。!?~,·、]+$/g, "")
    .trim()
}

export const EXTRACTION_SYSTEM =
  `당신은 대화에서 "오래 기억할 가치가 있는 사용자 정보"만 골라내는 추출기입니다.\n` +
  `보수적으로 판단하세요 — 애매하면 넣지 않습니다. 확실히 오래 유효하고 이 사용자 고유의 것만 추출합니다.\n` +
  `새로 기억할 게 없으면 빈 배열(memories: [])을 반환합니다. 억지로 채우지 마세요.`

// 추출 프롬프트: 최근 대화 + 이미 기억 중인 것(중복 금지)을 함께 보여준다.
export function buildExtractionPrompt(turns: ExtractTurn[], existing: string[]): string {
  const convo = turns
    .map((t) => `${t.role === "user" ? "사용자" : "에이전트"}: ${t.text}`)
    .join("\n")
  const existingBlock = existing.length ? existing.map((e) => `- ${e}`).join("\n") : "(아직 없음)"
  return (
    `아래는 사용자와 에이전트의 최근 대화입니다. 여기서 "앞으로도 계속 유효한, 이 사용자에 대한 ` +
    `오래 기억할 사실·선호·말투·교정"만 추출하세요.\n\n` +
    `# 이미 기억하고 있는 것 (아래와 같거나 비슷하면 다시 만들지 마세요)\n${existingBlock}\n\n` +
    `# 최근 대화\n${convo}\n\n` +
    `규칙:\n` +
    `- 오래 유효한 것만: 이번 한 번의 작업 지시·일회성 질문·맥락은 제외.\n` +
    `- 이 사용자 고유의 것만: 일반 상식이나 에이전트가 답한 내용은 제외.\n` +
    `- 위 "이미 기억하고 있는 것"과 중복·유사하면 절대 다시 만들지 마세요.\n` +
    `- 각 항목은 한 문장, 구체적으로. 새로 기억할 게 없으면 빈 배열.`
  )
}

// 후보 정리: 빈/과길이 제거, kind 검증, 기존·후보 간 중복 제거, 최대 5개.
export function dedupeCandidates(candidates: MemoryLite[], existing: string[]): MemoryLite[] {
  const seen = new Set(existing.map(normalizeMemoryContent))
  const out: MemoryLite[] = []
  for (const c of candidates) {
    const content = (c.content ?? "").trim()
    if (!content || content.length > 400) continue
    const key = normalizeMemoryContent(content)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ kind: isMemoryKind(c.kind) ? c.kind : "preference", content })
    if (out.length >= 5) break
  }
  return out
}

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
