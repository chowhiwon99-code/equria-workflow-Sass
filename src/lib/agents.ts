// 에이전트 빌더 공용 상수 (SSOT)

export const AGENT_MODELS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 · 기본 (빠르고 균형)" },
  { value: "claude-opus-4-7", label: "Opus 4.7 · 복잡한 작업 (고성능)" },
] as const

// 카테고리 라벨은 <select><option> 텍스트 전용 자리에 렌더되므로 lucide 컴포넌트를 못 넣는다 → 깔끔한 텍스트.
export const AGENT_CATEGORIES = [
  { value: "document", label: "문서·작성" },
  { value: "content", label: "콘텐츠" },
  { value: "cs", label: "고객 응대" },
  { value: "analytics", label: "데이터 분석" },
  { value: "translation", label: "번역" },
  { value: "tax", label: "세무·회계" },
  { value: "legal", label: "법무" },
  { value: "custom", label: "기타" },
] as const

// 새 에이전트 기본값 (lucide 기반 — 렌더는 components/agents/AgentIcon.tsx)
export const AGENT_DEFAULTS = {
  icon: "lucide:Bot",
  category: "custom",
  model: "claude-sonnet-4-6" as string,
  temperature: 0.7,
  maxTokens: 4096,
}

// 아이콘 정의 — lucide 기반. 저장값(value)은 "lucide:Name". 렌더/폴백은 AgentIcon.tsx,
// allowlist(AGENT_LUCIDE) 키와 아래 lucide 이름을 1:1로 맞춘다. 기존 이모지 저장값도 렌더러가 폴백 처리.
export type AgentIcon = {
  value: string // 저장값 — "lucide:Name"
  label: string // 접근성 라벨(스크린리더/aria)
  lucide: string // lucide 아이콘 이름(AGENT_LUCIDE 키)
  image?: string // 추후 제공될 커스텀 아이콘 경로(있으면 아이콘 대신 표시)
}

export const AGENT_ICONS: AgentIcon[] = [
  { value: "lucide:Bot", label: "로봇", lucide: "Bot" },
  { value: "lucide:Brain", label: "두뇌", lucide: "Brain" },
  { value: "lucide:PenLine", label: "글쓰기", lucide: "PenLine" },
  { value: "lucide:NotebookPen", label: "메모", lucide: "NotebookPen" },
  { value: "lucide:FileText", label: "문서", lucide: "FileText" },
  { value: "lucide:BarChart3", label: "차트", lucide: "BarChart3" },
  { value: "lucide:TrendingUp", label: "성장", lucide: "TrendingUp" },
  { value: "lucide:Clapperboard", label: "영상", lucide: "Clapperboard" },
  { value: "lucide:Film", label: "필름", lucide: "Film" },
  { value: "lucide:Smartphone", label: "모바일", lucide: "Smartphone" },
  { value: "lucide:Globe", label: "글로벌", lucide: "Globe" },
  { value: "lucide:MessageCircle", label: "대화", lucide: "MessageCircle" },
  { value: "lucide:Scale", label: "법무", lucide: "Scale" },
  { value: "lucide:Receipt", label: "영수증", lucide: "Receipt" },
  { value: "lucide:Languages", label: "번역", lucide: "Languages" },
  { value: "lucide:Search", label: "검색", lucide: "Search" },
  { value: "lucide:Lightbulb", label: "아이디어", lucide: "Lightbulb" },
  { value: "lucide:Target", label: "목표", lucide: "Target" },
  { value: "lucide:Wrench", label: "도구", lucide: "Wrench" },
  { value: "lucide:ShoppingBag", label: "쇼핑", lucide: "ShoppingBag" },
  { value: "lucide:Package", label: "물류", lucide: "Package" },
  { value: "lucide:Sparkles", label: "반짝임", lucide: "Sparkles" },
]

// 하위호환: 저장값 배열 (기존 import 보존 — 외부 소비처 없음)
export const AGENT_ICON_PRESETS = AGENT_ICONS.map((i) => i.value)

// 창의성(temperature) 프리셋 — 숫자 대신 사람이 이해할 수 있는 라벨로 제공
export type TempPreset = { value: number; label: string; desc: string }
export const TEMPERATURE_PRESETS: TempPreset[] = [
  { value: 0.3, label: "정확하게", desc: "일관·예측 가능 · 사실/번역/요약" },
  { value: 0.7, label: "균형", desc: "기본값 · 대부분의 업무에 적합" },
  { value: 1.0, label: "창의적으로", desc: "다양·아이디어 풍부 · 카피/브레인스토밍" },
]
