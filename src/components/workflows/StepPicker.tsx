"use client"

import { useState } from "react"
import { Plug, Search, Bot } from "lucide-react"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { renderAgentIcon, isLucideIcon } from "@/components/agents/AgentIcon"
import { MCP_TOOL_KO } from "@/lib/mcp"
import { cn } from "@/lib/utils"

type AgentOpt = { id: string; name: string; icon: string; description: string | null }
type McpTool = { name: string; description: string | null }

/**
 * 워크플로우 "단계 추가" 통합 피커 — 에이전트/도구 드롭다운 4개를 버튼 1개 + 이 모달로 대체.
 * AI 에이전트와 (연결된) MCP 도구를 한 곳에서 검색·선택. 고른 항목은 순서 맨 끝에 자동 연결된다.
 */
export function StepPicker({
  agents,
  mcpServers,
  mcpTools,
  onPickAgent,
  onPickMcp,
  onClose,
}: {
  agents: AgentOpt[]
  mcpServers: { id: string; name: string }[]
  mcpTools: Record<string, McpTool[]>
  onPickAgent: (agentId: string) => void
  onPickMcp: (serverId: string, toolName: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState("")
  const kw = q.trim().toLowerCase()

  const filteredAgents = agents.filter(
    (a) => !kw || a.name.toLowerCase().includes(kw) || (a.description ?? "").toLowerCase().includes(kw)
  )
  const mcpItems = mcpServers
    .flatMap((s) => (mcpTools[s.id] ?? []).map((tool) => ({ server: s, tool })))
    .filter(
      ({ tool }) =>
        !kw ||
        tool.name.toLowerCase().includes(kw) ||
        (MCP_TOOL_KO[tool.name] ?? tool.description ?? "").toLowerCase().includes(kw)
    )

  return (
    <Modal title="단계 추가" onClose={onClose} className="max-w-lg">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          추가하면 순서 맨 끝에 <b className="font-medium text-foreground">자동으로 연결</b>돼요. 실행하면 앞 단계 결과가 다음 단계로 이어집니다.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className={cn(fieldClass, "pl-8")}
            placeholder="에이전트·도구 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex max-h-[52vh] flex-col gap-3 overflow-y-auto">
          {/* AI 에이전트 */}
          <section className="flex flex-col gap-1.5">
            <h3 className="flex items-center gap-1.5 px-0.5 text-xs font-semibold text-muted-foreground">
              <Bot className="size-3.5" /> AI 에이전트
            </h3>
            {filteredAgents.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground/60">일치하는 에이전트가 없어요.</p>
            ) : (
              filteredAgents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    onPickAgent(a.id)
                    onClose()
                  }}
                  className="flex items-start gap-2.5 rounded-lg border bg-card p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
                    {renderAgentIcon(isLucideIcon(a.icon) ? a.icon : "lucide:Bot", "size-4")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.name}</span>
                    {a.description && (
                      <span className="line-clamp-1 text-xs text-muted-foreground">{a.description}</span>
                    )}
                  </span>
                </button>
              ))
            )}
          </section>

          {/* MCP 도구 (연결된 서버가 있을 때만) */}
          {mcpServers.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h3 className="flex items-center gap-1.5 px-0.5 text-xs font-semibold text-muted-foreground">
                <Plug className="size-3.5" /> MCP 도구
                <span className="font-normal text-muted-foreground/60">· 연결한 외부 도구를 직접 호출</span>
              </h3>
              {mcpItems.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground/60">일치하는 도구가 없어요.</p>
              ) : (
                mcpItems.map(({ server, tool }) => (
                  <button
                    key={`${server.id}:${tool.name}`}
                    onClick={() => {
                      onPickMcp(server.id, tool.name)
                      onClose()
                    }}
                    className="flex items-start gap-2.5 rounded-lg border bg-card p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-primary">
                      <Plug className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {tool.name} <span className="text-xs font-normal text-muted-foreground">· {server.name}</span>
                      </span>
                      {(MCP_TOOL_KO[tool.name] || tool.description) && (
                        <span className="line-clamp-1 text-xs text-muted-foreground">
                          {MCP_TOOL_KO[tool.name] || tool.description}
                        </span>
                      )}
                    </span>
                  </button>
                ))
              )}
            </section>
          )}
        </div>
      </div>
    </Modal>
  )
}
