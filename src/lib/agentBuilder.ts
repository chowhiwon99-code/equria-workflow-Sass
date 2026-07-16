// 가이드형 에이전트 빌더 — 위저드 입력 스키마 + skill.md 생성 메타프롬프트 (SSOT)
//
// 클라이언트(위저드 UI)와 서버(/api/agents/generate-prompt) 양쪽에서 import 한다.
// → 클라이언트 전용 의존성을 두지 말 것(순수 데이터/함수만).

export type WizardFieldType = "text" | "textarea" | "select" | "multiselect"

export type WizardField = {
  key: string
  label: string
  type: WizardFieldType
  options?: readonly string[]
  required: boolean
  placeholder?: string
  hint?: string // 질문 밑 안내문(있으면 select/multiselect 기본 문구 대신 사용)
  step: 1 | 2
}

// 출력 형식 — 개발자 용어(JSON/마크다운) 대신 "받는 결과물" 업무언어로.
// 단일 선택 + 미니 예시 + 직무 기반 추천(recommendOutputFormat). UI(AgentWizard)의 SSOT.
export type OutputFormatOption = {
  label: string // 카드 제목(짧게)
  value: string // 저장·직렬화 값(설명 포함 → 메타프롬프트가 구체적으로 이해)
  desc: string // 한 줄 설명
  example: string // 미니 예시(한 줄, 결과 모양)
  roles: readonly string[] // 이 직무면 "추천" 배지
}

export const OUTPUT_FORMATS: readonly OutputFormatOption[] = [
  {
    label: "바로 쓸 수 있는 초안",
    value: "바로 쓸 수 있는 초안 (이메일·메시지·답변)",
    desc: "그대로 복사해 보낼 수 있는 완성된 문장",
    example: "안녕하세요 고객님, 문의하신 교환 건은…",
    roles: ["CS", "영업", "마케팅", "HR"],
  },
  {
    label: "한눈에 보는 요약",
    value: "한눈에 보는 요약 (핵심 불릿)",
    desc: "핵심만 불릿으로 짧게",
    example: "• 매출 12%↑  • 신규 34명  • 재고부족 2건",
    roles: ["대표/경영진", "법무"],
  },
  {
    label: "정리된 표",
    value: "정리된 표 (항목·수치 정리)",
    desc: "항목과 수치를 표로 깔끔하게",
    example: "| 항목 | 금액 |   | 광고비 | 30만 |",
    roles: ["재무/회계", "MD/상품기획", "물류/SCM"],
  },
  {
    label: "단계별 안내",
    value: "단계별 안내 (순서대로)",
    desc: "순서대로 따라 할 수 있게",
    example: "1) 확인 → 2) 작성 → 3) 발송",
    roles: ["개발/IT"],
  },
  {
    label: "완성형 문서·보고서",
    value: "완성형 문서·보고서 (제목·본문)",
    desc: "제목·소제목을 갖춘 긴 글",
    example: "# 3분기 실적 보고 / ## 요약 / 본문…",
    roles: ["기획/전략"],
  },
  {
    label: "자유롭게 (AI가 알아서)",
    value: "자유롭게 (내용에 맞는 형식을 AI가 선택)",
    desc: "내용에 맞춰 표·요약·문장을 자동 선택",
    example: "상황에 따라 형식을 알아서 골라줘요",
    roles: ["디자인", "기타"],
  },
] as const

// 직무 → 추천 출력 형식(값). 매칭이 없으면 마지막 "자유롭게".
export function recommendOutputFormat(jobRole: string | undefined): string {
  const fallback = OUTPUT_FORMATS[OUTPUT_FORMATS.length - 1].value
  if (!jobRole) return fallback
  const hit = OUTPUT_FORMATS.find((o) => o.roles.includes(jobRole))
  return hit ? hit.value : fallback
}

// 사용자가 선택/작성하는 카테고리화된 입력. Step1=빠른 선택, Step2=자유 서술.
export const WIZARD_FIELDS: WizardField[] = [
  // ── Step 1: 기본 / 카테고리 (선택 위주, 빠르게) ──
  {
    key: "agentName",
    label: "에이전트 이름",
    type: "text",
    required: false,
    placeholder: "예: 문서 요약 도우미 (비워두면 AI가 추천)",
    step: 1,
  },
  {
    key: "purpose",
    label: "에이전트 목적 (한 줄)",
    type: "text",
    required: true,
    placeholder: "예: 반복 업무의 초안을 빠르게 만들어 준다",
    step: 1,
  },
  {
    key: "jobRole",
    label: "직무",
    type: "select",
    required: true,
    options: [
      "마케팅", "영업", "CS", "디자인", "물류/SCM", "재무/회계",
      "법무", "기획/전략", "HR", "MD/상품기획", "개발/IT", "대표/경영진", "기타",
    ],
    step: 1,
  },
  {
    key: "workArea",
    label: "업무 영역 (복수 선택)",
    type: "multiselect",
    required: true,
    options: [
      "콘텐츠 제작", "번역/현지화", "고객 응대", "데이터 분석", "문서/보고서 작성",
      "리서치/시장조사", "계약/법무 검토", "세무/회계", "일정/프로젝트 관리",
      "상품 기획", "SNS/광고 운영", "교육/온보딩",
    ],
    step: 1,
  },
  {
    key: "tone",
    label: "말투·톤",
    type: "select",
    required: true,
    options: [
      "정중한 존댓말(비즈니스)", "친근한 반존대", "간결·핵심만",
      "전문적·격식", "활기차고 트렌디(SNS)", "공감·따뜻함(CS)",
    ],
    step: 1,
  },
  {
    key: "language",
    label: "주 사용 언어",
    type: "select",
    required: false,
    options: ["한국어", "영어", "중국어", "일본어", "상황에 따라 자동"],
    step: 1,
  },
  // ── Step 2: 상세 입력 (자유 서술) ──
  {
    key: "detailedTasks",
    label: "세부 업무 (구체적으로 시켜볼 일)",
    type: "textarea",
    required: true,
    placeholder: "예: 무엇을 시킬지 구체적으로 (초안 작성·요약·분류·검토 등)",
    step: 2,
  },
  {
    key: "requiredData",
    label: "필요한 데이터 / 입력 자료",
    type: "textarea",
    required: false,
    placeholder: "예: 참고할 자료·양식·규칙 (아래에서 파일도 첨부할 수 있어요)",
    step: 2,
  },
  {
    key: "outputFormat",
    label: "출력 형식",
    type: "select",
    required: true,
    hint: "결과물을 어떤 모습으로 받을지 하나만 고르세요. (구체적 내용은 '세부 업무'를 따릅니다)",
    options: OUTPUT_FORMATS.map((o) => o.value),
    step: 2,
  },
  {
    key: "targetUser",
    label: "대상 사용자 / 수신자",
    type: "text",
    required: false,
    placeholder: "예: 고객, 거래처, 내부 직원",
    step: 2,
  },
  {
    key: "constraints",
    label: "금지사항·제약 (하지 말아야 할 것)",
    type: "textarea",
    required: false,
    placeholder: "예: 하지 말아야 할 것 (근거 없는 단정 금지, 추측은 추측이라 밝히기 등)",
    step: 2,
  },
  {
    key: "exampleScenario",
    label: "예시 입력 → 기대 결과 (선택)",
    type: "textarea",
    required: false,
    placeholder: "입력 예시와 원하는 출력을 한 쌍 적어주면 품질이 크게 올라갑니다",
    step: 2,
  },
]

export type WizardInputs = Record<string, string | string[]>

// 업무 영역 → 에이전트 카테고리 매핑(저장 시 기본 카테고리 추천)
export function inferCategory(inputs: WizardInputs): string {
  const areas = (inputs.workArea as string[]) ?? []
  const map: Record<string, string> = {
    "번역/현지화": "translation",
    "고객 응대": "cs",
    "데이터 분석": "analytics",
    "문서/보고서 작성": "document",
    "계약/법무 검토": "legal",
    "세무/회계": "tax",
    "콘텐츠 제작": "content",
    "SNS/광고 운영": "content",
  }
  for (const a of areas) if (map[a]) return map[a]
  return "custom"
}

// 입력을 메타프롬프트용 라벨-값 텍스트로 직렬화 (빈 값은 "(미입력)" 으로 추론 대상임을 표시)
export function serializeInputs(inputs: WizardInputs): string {
  return WIZARD_FIELDS.map((f) => {
    const v = inputs[f.key]
    const text = Array.isArray(v) ? v.join(", ") : (v ?? "")
    const shown = text && String(text).trim() ? String(text).trim() : "(미입력)"
    return `- ${f.label}: ${shown}`
  }).join("\n")
}

// skill.md 생성 메타프롬프트(system). 섹션 구조/순서 고정.
export const SKILL_MD_SYSTEM = `당신은 시니어 프롬프트 엔지니어입니다. 사용자가 제공한 구조화된 입력을 바탕으로, Anthropic Claude 모델이 사용할 고품질 한국어 "시스템 프롬프트(skill.md)"를 작성합니다.

[회사 컨텍스트 — 항상 반영]
- 이 에이전트는 회사 내부 직원 전용 워크스페이스(Complow)에서 사용됩니다(외부 공개 아님). 회사·업종별 세부 맥락은 사용자 입력을 따릅니다.

[출력 형식 — 반드시 준수]
- 아래 섹션 헤더와 순서를 그대로 사용한 "마크다운만" 출력합니다.
- 코드펜스(\`\`\`)나 머리말/맺음말 없이, 첫 줄을 "# {에이전트 이름}" 으로 바로 시작합니다.
- 모든 내용은 한국어로 작성합니다.

[섹션 구조 — 이 헤더/순서를 그대로]
# {에이전트 이름}
## 역할 (Role)
## 목표 (Goal)
## 컨텍스트 (Context)
## 핵심 역량 (Capabilities)
## 작업 절차 (Workflow)
## 입력 요구사항 (Required Input)
## 제약 및 금지사항 (Constraints)
## 말투와 어조 (Tone & Voice)
## 출력 형식 (Output Format)
## 예시 (Examples)
## 엣지 케이스 (Edge Cases)

[작성 규칙]
1. 각 섹션을 구체적이고 실행 가능하게 채웁니다. 빈 섹션을 만들지 않습니다.
2. 입력이 "(미입력)" 인 항목은 직무·업무 맥락에서 합리적으로 추론해 채우되, 존재하지 않는 도구·데이터·기능을 지어내지 않습니다.
3. "예시"와 "출력 형식"은 품질 기여도가 가장 크므로 반드시 구체적으로 작성합니다. 예시 입력이 없으면 세부 업무에서 대표 시나리오 1개를 만들어 "입력 예시 → 출력 예시" 형태로 보여줍니다.
4. K-뷰티 가드레일을 기본 포함합니다: 의학적 효능 단정 금지, 표시·광고법 리스크 문구 주의, 확신이 없으면 추측하지 말고 사용자에게 되묻기.
5. 에이전트 이름이 비어 있으면 목적에 맞는 간결한 이름을 직접 지어 첫 줄에 사용합니다.
6. 정보가 부족하면 임의로 진행하지 말고 먼저 질문하라는 규칙을 "작업 절차" 또는 "엣지 케이스"에 포함합니다.`
