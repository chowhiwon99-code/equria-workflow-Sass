// 워크플로우 노드 도구(행동) 카탈로그 SSOT.
// 지금은 webhook만 실작동. 고도화 시 youtube/figma/higgsfield/gmail 등을 여기에 추가하고
// 실행 라우트(/api/workflows/[id]/run)에 케이스를 더한다.
import type { WorkflowToolType } from "@/lib/workflows"

export type ToolCatalogItem = {
  type: WorkflowToolType
  label: string
  emoji: string
  desc: string
  /** 실제 작동 여부(false면 UI에 "준비 중"으로 노출, 선택 불가) */
  enabled: boolean
}

export const WORKFLOW_TOOLS: ToolCatalogItem[] = [
  { type: "none", label: "행동 없음", emoji: "💬", desc: "텍스트 결과만 생성", enabled: true },
  {
    type: "save_file",
    label: "파일로 저장",
    emoji: "📄",
    desc: "이 단계 결과를 .md 파일로 ‘파일 관리’에 저장",
    enabled: true,
  },
  {
    type: "notify",
    label: "완료 알림",
    emoji: "🔔",
    desc: "이 단계 결과를 내 알림으로 전송",
    enabled: true,
  },
  {
    type: "webhook",
    label: "웹훅 전송",
    emoji: "🔗",
    desc: "결과를 외부 URL로 POST (Make·Zapier·Slack·n8n → 유튜브 업로드 등으로 분기)",
    enabled: true,
  },
  // 고도화 예정 — 외부 연동(자리만 노출)
  { type: "none", label: "유튜브 업로드", emoji: "▶️", desc: "Google OAuth 연결 후 (준비 중)", enabled: false },
  { type: "none", label: "Higgsfield 제작", emoji: "🎬", desc: "이미지·영상 생성 (준비 중)", enabled: false },
  { type: "none", label: "Figma 제작", emoji: "🎨", desc: "디자인 생성 (준비 중)", enabled: false },
]

export function toolLabel(type: WorkflowToolType | undefined): string {
  if (!type || type === "none") return ""
  return WORKFLOW_TOOLS.find((t) => t.type === type)?.label ?? type
}

export function toolEmoji(type: WorkflowToolType | undefined): string {
  if (!type || type === "none") return ""
  return WORKFLOW_TOOLS.find((t) => t.type === type)?.emoji ?? "🔧"
}

/** 한 워크플로우의 최대 실행 노드 수 — Vercel 60s 타임아웃 안에 들도록 보수적으로 제한. */
export const MAX_RUN_NODES = 6

/**
 * 웹훅 URL 안전성 검사(SSRF 방지). https 외부 주소만 허용:
 * localhost·사설망(10/172.16-31/192.168)·링크로컬(169.254, 클라우드 메타데이터)·
 * .local/.internal 호스트를 차단한다. (리터럴 IP + 명백한 내부 호스트명 기준)
 */
export function isSafeWebhookUrl(raw: string | undefined): { ok: boolean; reason?: string } {
  if (!raw || !raw.trim()) return { ok: false, reason: "URL이 비어 있습니다." }
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return { ok: false, reason: "올바른 URL이 아닙니다." }
  }
  if (u.protocol !== "https:") return { ok: false, reason: "https 주소만 허용됩니다." }

  const host = u.hostname.toLowerCase()
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return { ok: false, reason: "내부 주소는 허용되지 않습니다." }
  }

  // 리터럴 IPv4 사설/링크로컬 범위 차단
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    const isPrivate =
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    if (isPrivate) return { ok: false, reason: "내부/사설 IP는 허용되지 않습니다." }
  }

  return { ok: true }
}
