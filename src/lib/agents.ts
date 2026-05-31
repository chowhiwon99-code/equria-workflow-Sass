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

// 아이콘 정의 — 현재는 이모지. 추후 커스텀 이미지 자산이 들어오면 `image`만 채우면
// 렌더가 자동으로 이모지 대신 이미지로 바뀐다(IconPicker.tsx 참고). 저장값은 emoji 문자열.
export type AgentIcon = {
  emoji: string
  label: string // 접근성 라벨(스크린리더/aria)
  image?: string // 추후 제공될 커스텀 아이콘 경로(있으면 이모지 대신 표시)
}

export const AGENT_ICONS: AgentIcon[] = [
  { emoji: "🤖", label: "로봇" },
  { emoji: "🧠", label: "두뇌" },
  { emoji: "✍️", label: "글쓰기" },
  { emoji: "📝", label: "메모" },
  { emoji: "📊", label: "차트" },
  { emoji: "📈", label: "성장" },
  { emoji: "🎬", label: "영상" },
  { emoji: "📱", label: "모바일" },
  { emoji: "🌐", label: "글로벌" },
  { emoji: "💬", label: "대화" },
  { emoji: "📄", label: "문서" },
  { emoji: "⚖️", label: "법무" },
  { emoji: "🔍", label: "검색" },
  { emoji: "💡", label: "아이디어" },
  { emoji: "🎯", label: "목표" },
  { emoji: "🛠️", label: "도구" },
  { emoji: "🛍️", label: "쇼핑" },
  { emoji: "💄", label: "뷰티" },
  { emoji: "📦", label: "물류" },
  { emoji: "✨", label: "반짝임" },
]

// 하위호환: 이모지 문자열 배열 (기존 import 보존)
export const AGENT_ICON_PRESETS = AGENT_ICONS.map((i) => i.emoji)

// 창의성(temperature) 프리셋 — 숫자 대신 사람이 이해할 수 있는 라벨로 제공
export type TempPreset = { value: number; label: string; desc: string }
export const TEMPERATURE_PRESETS: TempPreset[] = [
  { value: 0.3, label: "정확하게", desc: "일관·예측 가능 · 사실/번역/요약" },
  { value: 0.7, label: "균형", desc: "기본값 · 대부분의 업무에 적합" },
  { value: 1.0, label: "창의적으로", desc: "다양·아이디어 풍부 · 카피/브레인스토밍" },
]
