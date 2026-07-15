"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Pin, Lock, Globe, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { useUndo } from "@/components/undo/UndoProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { renderAgentIcon } from "@/components/agents/AgentIcon"
import type { Tables } from "@/lib/supabase/types"

type AgentRow = Pick<
  Tables<"agents">,
  "id" | "name" | "description" | "icon" | "category" | "is_public" | "created_by"
> & { creator: { name: string } | null }

export default function AgentsPage() {
  const supabase = createClient()
  const router = useRouter()
  const { push } = useUndo()
  const [agents, setAgents] = useState<AgentRow[]>([])
  const meId = useCurrentUserId()
  const [pins, setPins] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [{ data: ag }, { data: pn }] = await Promise.all([
      supabase
        .from("agents")
        .select("id, name, description, icon, category, is_public, created_by, creator:profiles!agents_created_by_fkey(name)")
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabase.from("user_agent_pins").select("agent_id"),
    ])
    setAgents((ag as AgentRow[]) ?? [])
    setPins(new Set((pn ?? []).map((p) => p.agent_id)))
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  // 되돌리기/다시실행(핀·삭제·생성)으로 데이터가 바뀌면 새로고침
  useEffect(() => {
    const h = () => load()
    window.addEventListener("equria:reload", h)
    return () => window.removeEventListener("equria:reload", h)
  }, [load])

  const mine = agents.filter((a) => a.created_by === meId)
  const defaults = agents.filter((a) => a.created_by === null)
  const shared = agents.filter((a) => a.created_by !== null && a.created_by !== meId && a.is_public)

  // 위젯은 핀한 에이전트만 보여줌(폴백 없음) → 화면 표시도 실제 핀 상태를 그대로 반영
  const effectivePins = pins

  // 위젯에 띄울 집합을 통째로 교체(델타 단순화).
  const togglePin = async (agentId: string) => {
    if (!meId) return
    const next = new Set(effectivePins)
    if (next.has(agentId)) next.delete(agentId)
    else next.add(agentId)
    setPins(next)
    try {
      // 전체 교체(델타 단순화): 기존 핀을 모두 지우고 next 집합을 다시 넣는다.
      // delete 성공 후 insert 실패 시 핀이 0개로 남아 위젯이 비므로, 둘 다 mustOk로 검증한다.
      await mustOk(supabase.from("user_agent_pins").delete().eq("user_id", meId))
      if (next.size > 0) {
        await mustOk(
          supabase.from("user_agent_pins").insert([...next].map((id) => ({ user_id: meId, agent_id: id })))
        )
      }
      window.dispatchEvent(new Event("equria:agents-changed"))
    } catch {
      // 실패 시 낙관적 로컬 상태를 버리고 DB에서 다시 동기화 + 사용자에게 알림
      await load()
      toast.error("위젯 설정을 저장하지 못했어요. 다시 시도해 주세요.")
    }
  }

  // 소프트 삭제(is_active=false) + ⌘Z 복구 — 수정 페이지 remove()와 동일 패턴(소유자만, RLS가 강제).
  const deleteAgent = async (agentId: string, name: string) => {
    if (!confirm(`'${name}' 에이전트를 삭제할까요? (위젯에서도 사라집니다 · ⌘Z로 복구 가능)`)) return
    try {
      await mustOk(supabase.from("agents").update({ is_active: false }).eq("id", agentId))
    } catch {
      toast.error("삭제하지 못했어요. 다시 시도해 주세요.")
      return
    }
    setAgents((prev) => prev.filter((a) => a.id !== agentId)) // 낙관적 제거
    push({
      label: "에이전트 삭제",
      undo: async () => {
        await mustOk(supabase.from("agents").update({ is_active: true }).eq("id", agentId))
        window.dispatchEvent(new Event("equria:agents-changed"))
        load()
      },
      redo: async () => {
        await mustOk(supabase.from("agents").update({ is_active: false }).eq("id", agentId))
        window.dispatchEvent(new Event("equria:agents-changed"))
        load()
      },
    })
    window.dispatchEvent(new Event("equria:agents-changed"))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">AI 에이전트 관리</h1>
          <p className="text-sm text-muted-foreground">
            나만의 에이전트를 만들고, 위젯에 띄울 에이전트를 고르세요. 실제 대화는 우하단 위젯(⌘K)에서.
          </p>
        </div>
        <Button size="sm" onClick={() => router.push("/agents/new")}>
          <Plus /> 새 에이전트
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : (
        <>
          <Section title="내 에이전트" empty="아직 만든 에이전트가 없어요. ‘새 에이전트’로 시작하세요.">
            {mine.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                pinned={effectivePins.has(a.id)}
                onTogglePin={() => togglePin(a.id)}
                onDelete={() => deleteAgent(a.id, a.name)}
                editable
              />
            ))}
          </Section>

          {defaults.length > 0 && (
            <Section title="기본 에이전트">
              {defaults.map((a) => (
                <AgentCard key={a.id} agent={a} pinned={effectivePins.has(a.id)} onTogglePin={() => togglePin(a.id)} />
              ))}
            </Section>
          )}

          {shared.length > 0 && (
            <Section title="공유된 에이전트">
              {shared.map((a) => (
                <AgentCard key={a.id} agent={a} pinned={effectivePins.has(a.id)} onTogglePin={() => togglePin(a.id)} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function Section({
  title,
  empty,
  children,
}: {
  title: string
  empty?: string
  children: React.ReactNode
}) {
  const arr = Array.isArray(children) ? children : [children]
  const isEmpty = arr.flat().filter(Boolean).length === 0
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
      {isEmpty ? (
        empty ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : null
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>
      )}
    </div>
  )
}

function AgentCard({
  agent,
  pinned,
  onTogglePin,
  onDelete,
  editable,
}: {
  agent: AgentRow
  pinned: boolean
  onTogglePin: () => void
  onDelete?: () => void
  editable?: boolean
}) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group flex flex-col gap-2 rounded-xl glass p-4 transition-shadow hover:shadow-[var(--shadow-md)]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
          {renderAgentIcon(agent.icon || "lucide:Bot", "size-5")}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onTogglePin()
            }}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors",
              pinned
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "text-muted-foreground hover:bg-muted"
            )}
            title={pinned ? "위젯에서 제거" : "위젯에 추가"}
            aria-pressed={pinned}
          >
            <Pin className={cn("size-3.5", pinned && "fill-current")} />
            {pinned ? "위젯에 있음" : "위젯에 추가"}
          </button>
          {editable && onDelete && (
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDelete()
              }}
              className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              title="삭제"
              aria-label={`${agent.name} 삭제`}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-semibold">{agent.name}</span>
        {editable &&
          (agent.is_public ? (
            <Globe className="size-3 shrink-0 text-muted-foreground" aria-label="공유됨" />
          ) : (
            <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="비공개" />
          ))}
      </div>
      {agent.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{agent.description}</p>
      )}

      <div className="mt-1 flex items-center justify-between border-t pt-2">
        <span className="text-[11px] text-muted-foreground">
          {agent.creator?.name ? `by ${agent.creator.name}` : "기본 제공"}
        </span>
        <span className="text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          상세 보기 →
        </span>
      </div>
    </Link>
  )
}
