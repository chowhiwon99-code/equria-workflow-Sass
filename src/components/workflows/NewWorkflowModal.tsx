"use client"

import { FilePlus } from "lucide-react"
import { Modal } from "@/components/shared/Modal"
import { WORKFLOW_TEMPLATES, buildTemplateGraph } from "@/lib/workflowTemplates"
import type { WorkflowGraph } from "@/lib/workflows"

type AgentOpt = { id: string; name: string; icon: string; description: string | null }

/**
 * "새 워크플로우" 시작 모달 — 빈 워크플로우 또는 예시 템플릿 중 선택.
 * 템플릿은 이 워크스페이스 에이전트로 미리 연결된 그래프를 만들어 준다(빈 캔버스 진입장벽 제거).
 */
export function NewWorkflowModal({
  agents,
  onPick,
  onClose,
}: {
  agents: AgentOpt[]
  onPick: (choice: { name: string; description: string | null; graph: WorkflowGraph }) => void
  onClose: () => void
}) {
  return (
    <Modal title="새 워크플로우" onClose={onClose} className="max-w-lg">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          예시로 시작하면 단계가 <b className="font-medium text-foreground">미리 연결</b>돼 있어요. 이후 단계 추가·수정·삭제는 자유롭게.
        </p>
        <div className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto">
          {/* 빈 워크플로우 */}
          <button
            onClick={() => onPick({ name: "새 워크플로우", description: null, graph: { nodes: [], edges: [] } })}
            className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <FilePlus className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">빈 워크플로우로 시작</span>
              <span className="text-xs text-muted-foreground">처음부터 직접 단계를 추가</span>
            </span>
          </button>

          {/* 예시 템플릿 */}
          {WORKFLOW_TEMPLATES.map((tpl) => {
            const graph = buildTemplateGraph(tpl, agents)
            const usable = graph.nodes.length >= 2 // 에이전트가 매칭돼야 의미 있음
            const flow = graph.nodes.map((n) => n.agent_name).join(" → ")
            return (
              <button
                key={tpl.id}
                disabled={!usable}
                onClick={() => onPick({ name: tpl.name, description: tpl.description, graph })}
                className="flex items-start gap-2.5 rounded-lg border bg-card p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-40"
                title={usable ? undefined : "이 템플릿에 필요한 에이전트가 없어요"}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-lg">{tpl.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{tpl.name}</span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">{tpl.description}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/70">
                    {usable ? flow : "필요한 에이전트가 없어요"}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
