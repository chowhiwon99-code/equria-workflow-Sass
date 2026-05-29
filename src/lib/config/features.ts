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
  Plug,
  Settings,
  FolderKanban,
  Receipt,
  Contact,
  FolderOpen,
  Mail,
  type LucideIcon,
} from "lucide-react"

export type FeatureStatus = "ready" | "wip" | "planned"

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
}

export const FEATURES: Feature[] = [
  {
    href: "/dashboard",
    label: "대시보드",
    description: "오늘의 일정과 자주 쓰는 에이전트 한눈에 보기",
    icon: LayoutDashboard,
    status: "wip",
    phase: 1,
  },
  {
    href: "/agents",
    label: "AI 에이전트",
    description: "8개 기본 에이전트 + 직접 만든 커스텀 에이전트와 대화",
    icon: Bot,
    status: "wip",
    phase: 2,
  },
  {
    href: "/projects",
    label: "프로젝트",
    description: "프로젝트 진행상황·담당자·일정 관리",
    icon: FolderKanban,
    status: "ready",
    phase: 3,
  },
  {
    href: "/chat",
    label: "직원 채팅",
    description: "직원과 1:1 실시간 메시지",
    icon: MessagesSquare,
    status: "ready",
    phase: 2,
  },
  {
    href: "/finance",
    label: "비용·매출",
    description: "영수증 사진 자동정리 + 세금계산서 초안",
    icon: Receipt,
    status: "ready",
    phase: 5,
  },
  {
    href: "/cards",
    label: "명함 관리",
    description: "명함 촬영 → 자동 스캔·등록",
    icon: Contact,
    status: "ready",
    phase: 5,
  },
  {
    href: "/calendar",
    label: "팀 캘린더",
    description: "팀 일정 공유 및 관리",
    icon: Calendar,
    status: "ready",
    phase: 4,
  },
  {
    href: "/files",
    label: "파일 관리",
    description: "Google Drive 연동 (준비 중)",
    icon: FolderOpen,
    status: "planned",
    phase: 6,
  },
  {
    href: "/mail",
    label: "메일",
    description: "Gmail 연동 (준비 중)",
    icon: Mail,
    status: "planned",
    phase: 6,
  },
  {
    href: "/workflows",
    label: "워크플로우",
    description: "에이전트를 체이닝해 업무 자동화",
    icon: Workflow,
    status: "planned",
    phase: 6,
  },
  {
    href: "/mcp",
    label: "MCP 연결",
    description: "Google Workspace 등 외부 도구 연결",
    icon: Plug,
    status: "planned",
    phase: 5,
  },
  {
    href: "/settings",
    label: "설정",
    description: "프로필 및 워크스페이스 설정",
    icon: Settings,
    status: "planned",
    phase: 1,
  },
]

/** 현재 경로에 해당하는 기능을 찾는다 (가장 긴 prefix 매칭). */
export function findFeatureByPath(pathname: string): Feature | undefined {
  return [...FEATURES]
    .sort((a, b) => b.href.length - a.href.length)
    .find((f) => pathname === f.href || pathname.startsWith(`${f.href}/`))
}
