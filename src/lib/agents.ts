// 에이전트 빌더 공용 상수 (SSOT)

export const AGENT_MODELS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 · 기본 (빠르고 균형)" },
  { value: "claude-opus-4-7", label: "Opus 4.7 · 복잡한 작업 (고성능)" },
] as const

export const AGENT_CATEGORIES = [
  { value: "document", label: "📝 문서·작성" },
  { value: "content", label: "🎬 콘텐츠" },
  { value: "cs", label: "💬 고객 응대" },
  { value: "analytics", label: "📊 데이터 분석" },
  { value: "translation", label: "🌐 번역" },
  { value: "tax", label: "📄 세무·회계" },
  { value: "legal", label: "⚖️ 법무" },
  { value: "custom", label: "🤖 기타" },
] as const

// 새 에이전트 기본값
export const AGENT_DEFAULTS = {
  icon: "🤖",
  category: "custom",
  model: "claude-sonnet-4-6" as string,
  temperature: 0.7,
  maxTokens: 4096,
}

// 아이콘 빠른 선택용 이모지
export const AGENT_ICON_PRESETS = [
  "🤖", "🧠", "✍️", "📝", "📊", "🎬", "📱", "🌐",
  "💬", "📄", "⚖️", "🔍", "💡", "🎯", "🛠️", "✨",
]
