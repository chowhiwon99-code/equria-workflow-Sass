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
  step: 1 | 2
}

// 사용자가 선택/작성하는 카테고리화된 입력. Step1=빠른 선택, Step2=자유 서술.
export const WIZARD_FIELDS: WizardField[] = [
  // ── Step 1: 기본 / 카테고리 (선택 위주, 빠르게) ──
  {
    key: "agentName",
    label: "에이전트 이름",
    type: "text",
    required: false,
    placeholder: "예: 브랜드 카피라이터 (비워두면 AI가 추천)",
    step: 1,
  },
  {
    key: "purpose",
    label: "에이전트 목적 (한 줄)",
    type: "text",
    required: true,
    placeholder: "예: 인스타·유튜브용 마케팅 카피를 빠르게 작성",
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
    placeholder: "예: 인스타 릴스 카피 3안 작성, 해시태그 10개 추천, 제품 USP 강조",
    step: 2,
  },
  {
    key: "requiredData",
    label: "필요한 데이터 / 입력 자료",
    type: "textarea",
    required: false,
    placeholder: "예: 제품명·성분·가격, 타깃 고객, 참고 톤앤매너",
    step: 2,
  },
  {
    key: "outputFormat",
    label: "출력 형식 (복수 선택)",
    type: "multiselect",
    required: true,
    options: [
      "불릿 요약", "표(table)", "단계별 가이드", "이메일/메시지 초안",
      "장문 문서", "코드/마크다운", "JSON/구조화 데이터", "번역문 + 설명", "자유 서술",
    ],
    step: 2,
  },
  {
    key: "targetUser",
    label: "대상 사용자 / 수신자",
    type: "text",
    required: false,
    placeholder: "예: 20대 여성 고객, 해외 바이어, 내부 임원",
    step: 2,
  },
  {
    key: "constraints",
    label: "금지사항·제약 (하지 말아야 할 것)",
    type: "textarea",
    required: false,
    placeholder: "예: 의학적 효능 단정 금지, 확정 법률자문 금지, 추측 시 명시",
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
- 회사: 이큐리아(EQURIA), K-뷰티 브랜드. 이 에이전트는 내부 직원 전용 워크스페이스에서 사용됩니다(외부 공개 아님).

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
