// 워크플로우 시작 템플릿(예시) — 빈 캔버스 대신 "바로 쓰는 예시"로 시작하게 한다.
// 에이전트는 이름 키워드로 이 워크스페이스의 실제 에이전트에 바인딩(없으면 그 단계는 건너뜀).
import { genId, linearEdges, type WorkflowGraph, type WorkflowNode, type WorkflowToolType } from "@/lib/workflows"

type TemplateAgent = { id: string; name: string; icon: string; description: string | null }

export type WorkflowTemplateStep = {
  /** 에이전트 이름에 포함되면 매칭(먼저 맞는 것 사용). */
  match: string[]
  /** 이 단계 추가 지시(선택). */
  note?: string
  /** 완료 후 행동(선택) — none/save_file/notify만(webhook은 URL 필요라 템플릿 제외). */
  tool?: Extract<WorkflowToolType, "save_file" | "notify">
}

export type WorkflowTemplate = {
  id: string
  name: string
  description: string
  emoji: string
  steps: WorkflowTemplateStep[]
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "sns-multilang",
    name: "SNS 콘텐츠 → 다국어 번역",
    description: "SNS 게시글 초안을 만들고 외국어로 번역해 파일로 저장해요.",
    emoji: "🌏",
    steps: [
      { match: ["SNS", "콘텐츠"], note: "주제에 맞는 SNS 게시글 초안을 작성" },
      { match: ["번역"], note: "위 게시글을 영어·중국어·일본어로 번역", tool: "save_file" },
    ],
  },
  {
    id: "doc-translate",
    name: "문서 작성 → 번역",
    description: "보고서·공지 초안을 쓰고 번역까지 한 번에.",
    emoji: "📝",
    steps: [{ match: ["문서"] }, { match: ["번역"] }],
  },
  {
    id: "content-image",
    name: "콘텐츠 → 이미지 프롬프트",
    description: "콘텐츠 아이디어에서 이미지·영상 AI 프롬프트를 만들어요.",
    emoji: "🎬",
    steps: [{ match: ["SNS", "콘텐츠"] }, { match: ["Higgsfield", "프롬프트"] }],
  },
  {
    id: "legal-summary",
    name: "계약서 검토 → 요약 보고",
    description: "계약서 리스크를 점검하고 경영진용 요약 보고서로 정리해요.",
    emoji: "⚖️",
    steps: [
      { match: ["법무"] },
      { match: ["문서"], note: "위 검토 결과를 경영진용으로 간결히 요약", tool: "save_file" },
    ],
  },
  {
    id: "data-report",
    name: "데이터 분석 → 보고서",
    description: "판매·마케팅 데이터에서 인사이트를 뽑아 보고서로 저장해요.",
    emoji: "📊",
    steps: [
      { match: ["데이터"] },
      { match: ["문서"], note: "분석 결과를 보고서 형식으로 정리", tool: "save_file" },
    ],
  },
]

/**
 * 템플릿 + 이 워크스페이스 에이전트 → 선형 워크플로우 그래프.
 * 매칭 실패한 단계는 건너뛴다(그 에이전트가 없는 워크스페이스 대비). 노드는 가로로 배치 + 순차 자동 연결.
 */
export function buildTemplateGraph(tpl: WorkflowTemplate, agents: TemplateAgent[]): WorkflowGraph {
  const nodes: WorkflowNode[] = []
  for (const step of tpl.steps) {
    const a = agents.find((ag) => step.match.some((m) => ag.name.includes(m)))
    if (!a) continue
    nodes.push({
      id: genId(),
      agent_id: a.id,
      agent_name: a.name,
      agent_icon: a.icon,
      agent_desc: a.description ?? undefined,
      note: step.note ?? "",
      tool: step.tool ? { type: step.tool } : undefined,
      x: 40 + nodes.length * 180,
      y: 40,
    })
  }
  return { nodes, edges: linearEdges(nodes) }
}
