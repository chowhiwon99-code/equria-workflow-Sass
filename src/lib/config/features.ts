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
  Stamp,
  type LucideIcon,
} from "lucide-react"
import type { PlanId } from "@/lib/plans"

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
  /** true면 사이드바 네비에서 숨김(라우트·제목은 유지 — 되돌리려면 이 값만 제거). */
  hiddenFromNav?: boolean
  /** true면 게스트(프로젝트 단위 초대)에게 허용 — 나머지는 GuestGuard·네비에서 차단(보안은 RLS가 담당). */
  guestAllowed?: boolean
  /**
   * 이 기능을 쓰려면 최소 이 요금제 이상이어야 함(랜딩 PLAN_ROWS와 반드시 일치).
   * 미지정이면 무료 포함. PlanGate(components/shared)가 이 값으로 화면을 막고,
   * 실제 강제는 각 테이블의 BEFORE INSERT 트리거(마이그143)가 담당한다.
   */
  minPlan?: PlanId
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
    guestAllowed: true,
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
    minPlan: "standard",
  },
  {
    href: "/cards",
    label: "명함 관리",
    description: "명함 촬영 → 자동 스캔·등록",
    icon: Contact,
    status: "ready",
    phase: 5,
    group: "work",
    minPlan: "standard",
  },
  {
    href: "/files",
    label: "파일 관리",
    description: "파일 업로드·정리",
    icon: FolderOpen,
    status: "ready",
    phase: 6,
    group: "work",
  },
  {
    href: "/approval",
    label: "전자결재",
    description: "기안·결재선·승인/반려",
    icon: Stamp,
    status: "ready",
    phase: 6,
    group: "work",
    minPlan: "standard",
  },
  {
    href: "/work",
    label: "근태",
    description: "출퇴근·근태 기록",
    icon: ClipboardList,
    status: "ready",
    phase: 6,
    group: "work",
    minPlan: "standard",
  },
  {
    href: "/meetings",
    label: "회의 노트",
    description: "회의록 작성·공유 + AI 요약/액션아이템",
    icon: NotebookPen,
    status: "ready",
    phase: 6,
    group: "work",
    minPlan: "standard",
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
  // ── 연동 ──
  {
    // 메일은 **작성·발송 전용**(2026-08-12 대표 결정 A안 — `GOOGLE_SCOPES`=gmail.send만).
    // 받은편지함 읽기는 gmail.readonly/modify가 구글 '제한' 스코프라 CASA 연간 보안감사를 부르므로 중단.
    // ✅ 2026-09-03 대표 결정: 사이드바 노출 안 함(계속 hiddenFromNav) — Gmail은 에이전트(MCP)로만
    // 쓰는 게 의도된 경로. `/mail` 라우트 자체는 살아있어(직접 URL 접근 가능) 코드는 유지.
    href: "/mail",
    label: "메일",
    description: "Gmail 연동 — 메일 작성·발송 (개인 계정 연결)",
    icon: Mail,
    status: "ready",
    phase: 6,
    group: "connect",
    hiddenFromNav: true,
  },
  {
    href: "/mcp",
    label: "MCP 연결",
    description: "외부 도구·커넥터 카탈로그",
    icon: Plug,
    status: "wip",
    phase: 5,
    group: "connect",
    minPlan: "pro",
  },
  // ── 계정 ──
  {
    href: "/mypage",
    guestAllowed: true,
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
