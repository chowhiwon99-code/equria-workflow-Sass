"use client"

import { useState } from "react"
import { Plug, Search, Bot, ChevronDown, ChevronRight } from "lucide-react"
import { Modal, fieldClass } from "@/components/shared/Modal"
import { renderAgentIcon, isLucideIcon } from "@/components/agents/AgentIcon"
import { MCP_TOOL_KO } from "@/lib/mcp"
import { cn } from "@/lib/utils"

type AgentOpt = { id: string; name: string; icon: string; description: string | null }
type McpTool = { name: string; description: string | null }

/**
 * 워크플로우 "단계 추가" 통합 피커 — 에이전트/도구 드롭다운 4개를 버튼 1개 + 이 모달로 대체.
 * MCP 도구는 서버별 접이식 그룹으로 묶어 긴 목록을 스캔하기 쉽게 한다. 고른 항목은 순서 맨 끝에 자동 연결.
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
  // 서버가 하나면 기본 펼침, 여럿이면 접어서 짧게. 검색 중엔 강제 펼침.
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(mcpServers.length === 1 ? [mcpServers[0].id] : []))
  const kw = q.trim().toLowerCase()
  const searching = kw.length > 0

  const toolText = (t: McpTool) => MCP_TOOL_KO[t.name] || t.description || ""
  const matchTool = (t: McpTool) => !kw || t.name.toLowerCase().includes(kw) || toolText(t).toLowerCase().includes(kw)

  const filteredAgents = agents.filter(
    (a) => !kw || a.name.toLowerCase().includes(kw) || (a.description ?? "").toLowerCase().includes(kw)
  )
  const serverGroups = mcpServers
    .map((server) => {
      const all = mcpTools[server.id] ?? []
      return { server, tools: all.filter(matchTool), total: all.length }
    })
    .filter((g) => g.total > 0 && (g.tools.length > 0 || !searching))

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

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

        <div className="flex max-h-[56vh] flex-col gap-4 overflow-y-auto pr-0.5">
          {/* AI 에이전트 */}
          <section className="flex flex-col gap-1.5">
            <h3 className="flex items-center gap-1.5 px-0.5 text-xs font-semibold text-muted-foreground">
              <Bot className="size-3.5" /> AI 에이전트
            </h3>
            {filteredAgents.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground/60">일치하는 에이전트가 없어요.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredAgents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      onPickAgent(a.id)
                      onClose()
                    }}
                    className="flex items-center gap-2.5 rounded-lg border bg-card p-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
                      {renderAgentIcon(isLucideIcon(a.icon) ? a.icon : "lucide:Bot", "size-4")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      {a.description && (
                        <span className="line-clamp-1 text-xs text-muted-foreground">{a.description}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* MCP 도구 — 서버별 접이식 그룹 */}
          {mcpServers.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h3 className="flex items-center gap-1.5 px-0.5 text-xs font-semibold text-muted-foreground">
                <Plug className="size-3.5" /> MCP 도구
                <span className="font-normal text-muted-foreground/60">· 연결한 외부 도구를 직접 호출</span>
              </h3>
              {serverGroups.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground/60">일치하는 도구가 없어요.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {serverGroups.map(({ server, tools }) => {
                    const open = searching || openIds.has(server.id)
                    return (
                      <div key={server.id} className="overflow-hidden rounded-lg border">
                        {/* 서버 헤더 (클릭해 펼치기/접기) */}
                        <button
                          onClick={() => !searching && toggle(server.id)}
                          className={cn(
                            "flex w-full items-center gap-2 bg-muted/30 px-2.5 py-2 text-left transition-colors",
                            !searching && "hover:bg-muted/50"
                          )}
                        >
                          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/8 text-primary">
                            <Plug className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{server.name}</span>
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                            도구 {tools.length}
                          </span>
                          {!searching &&
                            (open ? (
                              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                            ))}
                        </button>
                        {/* 도구 목록 */}
                        {open && (
                          <div className="flex flex-col border-t">
                            {tools.map((t) => (
                              <button
                                key={t.name}
                                onClick={() => {
                                  onPickMcp(server.id, t.name)
                                  onClose()
                                }}
                                className="flex flex-col gap-0.5 border-b px-2.5 py-1.5 text-left transition-colors last:border-b-0 hover:bg-primary/5"
                              >
                                <span className="truncate text-sm font-medium">{t.name}</span>
                                {toolText(t) && (
                                  <span className="line-clamp-1 text-xs text-muted-foreground">{toolText(t)}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </Modal>
  )
}
