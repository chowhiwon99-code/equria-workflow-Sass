/**
 * Feature registry — single source of truth (SSOT).
 *
 * 사이드바 네비게이션, 라우팅, 대시보드 카드가 모두 이 배열을 참조한다.
 * 새 기능을 추가/수정할 때는 여기만 고치면 된다.
 */
import {
  LayoutDashboard,
  Bot,
  Calendar,
  Workflow,
  MessagesSquare,
  Users,
  Plug,
  Settings,
  FolderKanban,
  Receipt,
  Contact,
  FolderOpen,
  Mail,
  UserCircle,
  ClipboardList,
  NotebookPen,
  type LucideIcon,
} from "lucide-react"

export type FeatureStatus = "ready" | "wip" | "planned"
export type FeatureGroup = "main" | "work" | "ai" | "connect" | "account"

export interface Feature {
  /** 라우트 경로 (app 그룹 기준) */
  href: string
  /** 사이드바/카드에 표시되는 한국어 라벨 */
  label: string
  /** 한 줄 설명 (대시보드 카드/툴팁용) */
  description: string
  icon: LucideIcon
  /** 개발 단계 — 스텁/구현 여부 표시에 사용 */
  status: FeatureStatus
  /** PLAN.md의 개발 Phase */
  phase: number
  /** 사이드바 섹션 그룹 */
  group: FeatureGroup
}

/** 사이드바 그룹 순서 + 헤더 라벨 (label=null 이면 헤더 없이 최상단)
 *  ※ "main"(대시보드)은 사이드바에서 제외 — 로고 클릭으로 대시보드(메인 Claude 챗)로 이동.
 *    대시보드 Feature 정의는 라우팅/제목/findFeatureByPath 용으로 FEATURES에 유지. */
export const FEATURE_GROUPS: { id: FeatureGroup; label: string | null }[] = [
  { id: "work", label: "업무" },
  { id: "ai", label: "AI" },
  { id: "connect", label: "연동" },
  { id: "account", label: "계정" },
]

export const FEATURES: Feature[] = [
  // ── 최상단 ──
  {
    href: "/dashboard",
    label: "대시보드",
    description: "오늘의 일정과 자주 쓰는 에이전트 한눈에 보기",
    icon: LayoutDashboard,
    status: "wip",
    phase: 1,
    group: "main",
  },
  // ── 업무 ──
  {
    href: "/calendar",
    label: "팀 캘린더",
    description: "팀 일정 공유 및 관리",
    icon: Calendar,
    status: "ready",
    phase: 4,
    group: "work",
  },
  {
    href: "/projects",
    label: "프로젝트",
    description: "프로젝트 진행상황·담당자·일정 관리",
    icon: FolderKanban,
    status: "ready",
    phase: 3,
    group: "work",
  },
  {
    href: "/chat",
    label: "직원 채팅",
    description: "직원과 1:1 실시간 메시지",
    icon: MessagesSquare,
    status: "ready",
    phase: 2,
    group: "work",
  },
  {
    href: "/members",
    label: "구성원",
    description: "부서·직급별 구성원과 공개 연락처",
    icon: Users,
    status: "ready",
    phase: 2,
    group: "work",
  },
  {
    href: "/finance",
    label: "비용·매출",
    description: "영수증 사진 자동정리 + 세금계산서 초안",
    icon: Receipt,
    status: "ready",
    phase: 5,
    group: "work",
  },
  {
    href: "/cards",
    label: "명함 관리",
    description: "명함 촬영 → 자동 스캔·등록",
    icon: Contact,
    status: "ready",
    phase: 5,
    group: "work",
  },
  {
    href: "/files",
    label: "파일 관리",
    description: "파일 업로드·정리 (Google Drive 연동 예정)",
    icon: FolderOpen,
    status: "wip",
    phase: 6,
    group: "work",
  },
  {
    href: "/work",
    label: "근태·결재",
    description: "근태(출퇴근)·지출결의서·휴가를 한 곳에서",
    icon: ClipboardList,
    status: "ready",
    phase: 6,
    group: "work",
  },
  {
    href: "/meetings",
    label: "회의 노트",
    description: "회의록 작성·공유 + AI 요약/액션아이템",
    icon: NotebookPen,
    status: "ready",
    phase: 6,
    group: "work",
  },
  // ── AI ──
  {
    href: "/agents",
    label: "AI 에이전트",
    description: "에이전트 빌더 (실제 대화는 우하단 위젯에서)",
    icon: Bot,
    status: "ready",
    phase: 3,
    group: "ai",
  },
  {
    href: "/workflows",
    label: "워크플로우",
    description: "에이전트를 체이닝해 업무 자동화",
    icon: Workflow,
    status: "wip",
    phase: 6,
    group: "ai",
  },
  // ── 연동 ──
  {
    href: "/mail",
    label: "메일",
    description: "Gmail 연동 — 받은편지함·작성·발송 (개인 계정 연결)",
    icon: Mail,
    status: "ready",
    phase: 6,
    group: "connect",
  },
  {
    href: "/mcp",
    label: "MCP 연결",
    description: "외부 도구·커넥터 카탈로그",
    icon: Plug,
    status: "wip",
    phase: 5,
    group: "connect",
  },
  // ── 계정 ──
  {
    href: "/mypage",
    label: "마이페이지",
    description: "내 프로필·내 에이전트·사용량",
    icon: UserCircle,
    status: "ready",
    phase: 1,
    group: "account",
  },
  {
    href: "/settings",
    label: "설정",
    description: "프로필·테마·워크스페이스 설정",
    icon: Settings,
    status: "ready",
    phase: 1,
    group: "account",
  },
]

/** 현재 경로에 해당하는 기능을 찾는다 (가장 긴 prefix 매칭). */
export function findFeatureByPath(pathname: string): Feature | undefined {
  return [...FEATURES]
    .sort((a, b) => b.href.length - a.href.length)
    .find((f) => pathname === f.href || pathname.startsWith(`${f.href}/`))
}
