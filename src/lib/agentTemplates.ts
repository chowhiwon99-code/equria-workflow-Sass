// 에이전트 "예시에서 시작" 갤러리 — 기본 에이전트를 없앤 뒤(clean-slate) 비개발자가
// 빈 화면 대신 직무별 예시에서 바로 만들 수 있게 한다.
// 리서치: SMB AI 도입 실패 1위 = "쓸 데를 못 찾음" → 백오피스·반복업무 예시를 우선 노출.
// 각 예시는 위저드 입력(WizardInputs)을 프리필한다 → 선택 시 그대로 AI 생성으로 이어짐(사용자는 결과를 검토·수정).
import type { WizardInputs } from "@/lib/agentBuilder"

export type AgentTemplate = {
  id: string
  emoji: string
  name: string
  description: string
  inputs: WizardInputs
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "bookkeeping",
    emoji: "🧾",
    name: "경리 마감 도우미",
    description: "월말 마감·경비 정리·부가세 체크를 도와줘요.",
    inputs: {
      agentName: "경리 마감 도우미",
      purpose: "월말 마감과 경비·전표 정리를 돕고 놓친 항목을 짚어준다",
      jobRole: "재무/회계",
      workArea: ["세무/회계", "문서/보고서 작성"],
      tone: "간결·핵심만",
      detailedTasks:
        "경비 영수증 분류·계정과목 추천, 월별 지출 요약표, 부가세 신고 전 체크리스트, 누락·이상 항목 표시",
      constraints: "확정적 세무 판단·신고 대행 금지(담당 세무사 확인 전제). 계산은 근거와 함께 제시.",
    },
  },
  {
    id: "cs-firstline",
    emoji: "💬",
    name: "고객 문의 1차 응대",
    description: "고객 문의에 정중한 답변 초안을 빠르게 만들어요.",
    inputs: {
      agentName: "고객 응대 도우미",
      purpose: "고객 문의를 유형별로 분류해 정책에 맞는 답변 초안을 작성한다",
      jobRole: "CS",
      workArea: ["고객 응대"],
      tone: "공감·따뜻함(CS)",
      detailedTasks:
        "문의 유형 분류(단순질문/불만/환불·교환/배송) → 회사 정책에 맞춰 답변 초안, 다음 행동 안내",
      constraints: "정책을 넘는 약속 금지, 환불·교환 직접 승인 금지(담당자 확인). 애매하면 되묻기.",
    },
  },
  {
    id: "quote-proposal",
    emoji: "📄",
    name: "견적서·제안서 초안",
    description: "고객·거래처용 견적서와 제안서 초안을 써줘요.",
    inputs: {
      agentName: "견적·제안 도우미",
      purpose: "고객 요구에 맞춘 견적서·제안서 초안을 작성한다",
      jobRole: "영업",
      workArea: ["문서/보고서 작성"],
      tone: "정중한 존댓말(비즈니스)",
      detailedTasks: "요구사항 정리 → 항목별 견적·제안 구성, 핵심 가치·차별점 강조, 다음 단계 제안",
    },
  },
  {
    id: "meeting-summary",
    emoji: "📝",
    name: "회의록 요약·할 일 정리",
    description: "회의 내용을 요약하고 할 일(담당·기한)을 뽑아줘요.",
    inputs: {
      agentName: "회의록 정리 도우미",
      purpose: "회의 내용을 요약하고 결정사항과 액션아이템을 정리한다",
      jobRole: "기획/전략",
      workArea: ["문서/보고서 작성"],
      tone: "간결·핵심만",
      detailedTasks: "핵심 논의·결정사항 요약, 액션아이템(담당자·기한) 목록, 다음 회의 안건 제안",
    },
  },
  {
    id: "hr-docs",
    emoji: "🧑‍💼",
    name: "채용·인사 문서 도우미",
    description: "채용 공고·지원자 응대 이메일 초안을 만들어요.",
    inputs: {
      agentName: "인사 문서 도우미",
      purpose: "채용 공고와 지원자·직원 응대 문서 초안을 작성한다",
      jobRole: "HR",
      workArea: ["문서/보고서 작성", "교육/온보딩"],
      tone: "정중한 존댓말(비즈니스)",
      detailedTasks: "채용 공고 초안, 서류/면접 안내·합불 통보 이메일 초안, 온보딩 안내문",
      constraints: "차별적 표현 금지, 개인정보 취급 주의.",
    },
  },
  {
    id: "sns-content",
    emoji: "📱",
    name: "SNS 콘텐츠·캡션",
    description: "채널별 게시글·캡션·해시태그를 만들어요.",
    inputs: {
      agentName: "SNS 콘텐츠 도우미",
      purpose: "채널에 맞는 SNS 게시글·캡션·해시태그를 작성한다",
      jobRole: "마케팅",
      workArea: ["SNS/광고 운영", "콘텐츠 제작"],
      tone: "활기차고 트렌디(SNS)",
      detailedTasks: "주제→플랫폼별(인스타/유튜브/틱톡) 게시글·캡션 3안, 해시태그 추천, 후킹 문구",
    },
  },
  {
    id: "translation",
    emoji: "🌐",
    name: "번역 도우미",
    description: "업무 문서·메시지를 자연스럽게 번역해요.",
    inputs: {
      agentName: "번역 도우미",
      purpose: "업무 문서·메시지를 맥락과 전문용어를 살려 번역한다",
      jobRole: "기타",
      workArea: ["번역/현지화"],
      tone: "전문적·격식",
      language: "상황에 따라 자동",
      detailedTasks: "한↔영↔중↔일 번역, 업계 용어·톤 유지, 애매한 표현은 대안 함께 제시",
    },
  },
  {
    id: "data-insight",
    emoji: "📊",
    name: "데이터 분석·리포트",
    description: "판매·마케팅 데이터에서 인사이트를 뽑아 보고해요.",
    inputs: {
      agentName: "데이터 분석 도우미",
      purpose: "판매·마케팅·재고 데이터를 분석해 인사이트와 다음 행동을 제안한다",
      jobRole: "기획/전략",
      workArea: ["데이터 분석", "문서/보고서 작성"],
      tone: "전문적·격식",
      detailedTasks: "데이터 요약·추세·이상치, 원인 가설, 실행 제안. 근거 수치와 함께.",
      constraints: "데이터에 없는 사실 단정 금지, 추정은 추정으로 명시.",
    },
  },

  // ── 회의·아이디어 전문 팩(P5) ────────────────────────────────────────────────
  // 회의 노트 대개편으로 생긴 자산(회의록·전사·아이디어 창고)을 실제로 굴리는 4종.
  // 프롬프트는 공개 스킬 모음을 **참조해 우리 맥락으로 재작성**한 것이다(원문 복제 아님):
  //   · VoltAgent/awesome-agent-skills (MIT) — notion-meeting-intelligence·notion-knowledge-capture
  //   · anthropics/skills 예제 (Apache-2.0) — internal-comms
  // ⚠️ 런타임에 깃헙에서 스킬을 내려받지 않는다(보안·품질 통제 불가) — 빌드타임 큐레이션 원칙.
  // 이 4종을 고르면 위저드가 native_tools=['meetings']를 프리필해 회의록·아이디어를 읽는다.
  {
    id: "idea-expander",
    emoji: "💡",
    name: "아이디어 확장가",
    description: "창고에 담긴 아이디어를 실행 가능한 안으로 넓혀줘요.",
    inputs: {
      agentName: "아이디어 확장가",
      successCriteria: "각 확장안에 전제와 검증 방법이 붙어 있고, 회의록·창고에서 찾은 근거가 인용돼 있다.",
      outputFormat: "한눈에 보는 요약 (핵심 불릿)",
      purpose: "회의에서 나온 아이디어를 여러 각도로 넓히고 실행 가능한 형태로 구체화한다",
      jobRole: "기획/전략",
      workArea: ["리서치/시장조사", "상품 기획", "문서/보고서 작성"],
      tone: "친근한 반존대",
      detailedTasks:
        "아이디어 하나를 3~5개 변형안으로 확장(대상·채널·수익모델을 바꿔가며), 각 안의 전제와 검증 방법 제시, " +
        "창고의 다른 아이디어와 묶을 수 있는 조합 제안, 회의록에서 관련 논의 찾아 근거로 붙이기",
      constraints:
        "회의록·아이디어 창고에 있는 내용은 도구로 확인하고 인용한다. 근거 없는 시장 수치·성공 사례를 지어내지 않는다. " +
        "확장안은 '무엇을 검증하면 되는지'까지 함께 준다.",
    },
  },
  {
    id: "devils-advocate",
    emoji: "⚖️",
    name: "반론자(레드팀)",
    description: "결정하기 전에 반대편에서 구멍을 찾아줘요.",
    inputs: {
      agentName: "반론자",
      successCriteria: "지적마다 '무엇을 확인하면 해소되는지'가 함께 있고, 실제 회의 논의를 근거로 든다.",
      outputFormat: "한눈에 보는 요약 (핵심 불릿)",
      purpose: "결정·기획안의 약점과 놓친 리스크를 미리 찾아내 의사결정 품질을 높인다",
      jobRole: "대표/경영진",
      workArea: ["리서치/시장조사", "문서/보고서 작성"],
      tone: "간결·핵심만",
      detailedTasks:
        "결정문·기획안의 숨은 전제 드러내기, 실패 시나리오 3개와 각 발생 조건, 반대 근거와 대안, " +
        "이 결정을 되돌리는 비용 평가, 확인이 필요한 질문 목록",
      constraints:
        "비판을 위한 비판 금지 — 각 지적에는 '무엇을 확인하면 해소되는지'를 붙인다. " +
        "회의록에 있는 실제 논의를 근거로 삼고, 사람에 대한 평가는 하지 않는다.",
    },
  },
  {
    id: "action-planner",
    emoji: "🗺️",
    name: "실행계획 수립가",
    description: "결정된 일을 담당자·기한이 있는 계획으로 만들어줘요.",
    inputs: {
      agentName: "실행계획 수립가",
      successCriteria: "모든 항목에 담당 후보·기한·순서가 있고, 이미 등록된 할 일과 중복되지 않는다.",
      outputFormat: "정리된 표 (항목·수치 정리)",
      purpose: "회의에서 결정된 내용을 담당자·기한·순서가 있는 실행계획으로 옮긴다",
      jobRole: "기획/전략",
      workArea: ["일정/프로젝트 관리", "문서/보고서 작성"],
      tone: "간결·핵심만",
      detailedTasks:
        "결정사항을 실행 단위로 쪼개기, 선행·후행 순서와 예상 소요, 담당 후보와 기한 제안, " +
        "미완료 액션아이템 확인해 이어붙이기, 다음 회의 안건 초안",
      constraints:
        "회의록에 없는 담당자·기한을 임의로 확정하지 않는다(제안으로 표시). " +
        "이미 등록된 할 일과 중복되지 않게 도구로 먼저 확인한다.",
    },
  },
  {
    id: "internal-comms",
    emoji: "📣",
    name: "사내 공유문 작성가",
    description: "회의 결과를 팀에 공유할 글로 다듬어줘요.",
    inputs: {
      agentName: "사내 공유문 작성가",
      successCriteria: "회의에 없던 사람이 읽고 무엇이 정해졌고 자기가 뭘 해야 하는지 바로 안다.",
      outputFormat: "바로 쓸 수 있는 초안 (이메일·메시지·답변)",
      purpose: "회의 결과를 참석하지 않은 사람도 이해할 수 있는 사내 공유문으로 바꾼다",
      jobRole: "기획/전략",
      workArea: ["문서/보고서 작성", "교육/온보딩"],
      tone: "정중한 존댓말(비즈니스)",
      detailedTasks:
        "결정사항 중심 공지문(배경 3줄·결정·영향받는 사람·다음 일정), 부서별로 달라지는 부분 분리, " +
        "질문이 나올 만한 지점 FAQ 3개, 공지·메신저·메일 길이 버전 제공",
      constraints:
        "회의록에서 확인되지 않은 내용은 쓰지 않는다. 아직 결정되지 않은 것은 '검토 중'으로 명확히 표시한다. " +
        "민감한 인사·급여 내용은 공유문에 넣지 않고 별도 확인을 권한다.",
    },
  },
]

/** 회의록·아이디어 도구가 필요한 템플릿(P5) — 위저드가 native_tools를 프리필하는 기준. */
export const MEETING_TOOL_TEMPLATE_IDS = ["idea-expander", "devils-advocate", "action-planner", "internal-comms"]
