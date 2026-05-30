"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Tables } from "@/lib/supabase/types"

export type Agent = Pick<
  Tables<"agents">,
  "id" | "name" | "description" | "icon" | "category"
>

export type WidgetPosition = { x: number; y: number }

type AgentChatState = {
  agents: Agent[]
  loading: boolean
  isOpen: boolean
  isExpanded: boolean
  unread: boolean
  selectedAgentId: string | null
  conversationIdByAgent: Record<string, string>
  /** 에이전트별 chat 인스턴스 nonce — "새 대화" 클릭 시 증가시켜 ChatBody를 강제 remount한다 */
  chatVersionByAgent: Record<string, number>
  /** 위젯 좌상단 좌표(px). null이면 기본 우하단(CSS bottom-6 right-6) */
  position: WidgetPosition | null
}

type AgentChatActions = {
  open: () => void
  close: () => void
  toggle: () => void
  setExpanded: (v: boolean) => void
  setSelectedAgent: (id: string) => void
  setConversationId: (agentId: string, conversationId: string) => void
  startNewConversation: () => void
  setUnread: (v: boolean) => void
  setPosition: (pos: WidgetPosition | null) => void
}

const Ctx = createContext<(AgentChatState & AgentChatActions) | null>(null)

const STORAGE_KEY = "equria.agent-chat"

type Persisted = {
  selectedAgentId?: string | null
  position?: WidgetPosition | null
}

function loadPersisted(): Persisted {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Persisted
  } catch {
    return {}
  }
}

export function AgentChatProvider({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [unread, setUnread] = useState(false)
  const [selectedAgentId, setSelectedAgentIdState] = useState<string | null>(null)
  const [conversationIdByAgent, setConversationIdByAgentState] = useState<
    Record<string, string>
  >({})
  const [chatVersionByAgent, setChatVersionByAgentState] = useState<
    Record<string, number>
  >({})
  const [position, setPositionState] = useState<WidgetPosition | null>(null)

  useEffect(() => {
    const persisted = loadPersisted()
    if (persisted.selectedAgentId) setSelectedAgentIdState(persisted.selectedAgentId)
    if (persisted.position) setPositionState(persisted.position)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const payload: Persisted = { selectedAgentId, position }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [selectedAgentId, position])

  // 위젯에 띄울 에이전트 = 내가 핀한 것. 핀이 0개면 공개 기본 에이전트로 폴백(위젯 안 비게).
  const loadAgents = useCallback(async () => {
    const supabase = createClient()
    const { data: pinRows } = await supabase.from("user_agent_pins").select("agent_id")
    const pinnedIds = (pinRows ?? []).map((p) => p.agent_id)

    let query = supabase
      .from("agents")
      .select("id, name, description, icon, category")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
    query = pinnedIds.length > 0 ? query.in("id", pinnedIds) : query.eq("is_public", true)

    const { data } = await query
    const list = (data ?? []) as Agent[]
    setAgents(list)
    setLoading(false)
    setSelectedAgentIdState((cur) => (cur && list.some((a) => a.id === cur) ? cur : list[0]?.id ?? null))
  }, [])

  useEffect(() => {
    loadAgents()
    // 빌더에서 생성/삭제/핀 변경 시 위젯 갱신
    const h = () => loadAgents()
    window.addEventListener("equria:agents-changed", h)
    return () => window.removeEventListener("equria:agents-changed", h)
  }, [loadAgents])

  const open = useCallback(() => {
    setIsOpen(true)
    setUnread(false)
  }, [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => {
    setIsOpen((v) => {
      if (!v) setUnread(false)
      return !v
    })
  }, [])
  const setExpanded = useCallback((v: boolean) => setIsExpanded(v), [])
  const setSelectedAgent = useCallback((id: string) => {
    setSelectedAgentIdState(id)
  }, [])
  const setConversationId = useCallback((agentId: string, conversationId: string) => {
    setConversationIdByAgentState((prev) =>
      prev[agentId] === conversationId ? prev : { ...prev, [agentId]: conversationId }
    )
  }, [])
  const setPosition = useCallback((pos: WidgetPosition | null) => {
    setPositionState(pos)
  }, [])
  const startNewConversation = useCallback(() => {
    if (!selectedAgentId) return
    setConversationIdByAgentState((prev) => {
      const next = { ...prev }
      delete next[selectedAgentId]
      return next
    })
    // 클라이언트 messages 상태도 초기화하기 위해 ChatBody 강제 remount
    setChatVersionByAgentState((prev) => ({
      ...prev,
      [selectedAgentId]: (prev[selectedAgentId] ?? 0) + 1,
    }))
  }, [selectedAgentId])

  return (
    <Ctx.Provider
      value={{
        agents,
        loading,
        isOpen,
        isExpanded,
        unread,
        selectedAgentId,
        conversationIdByAgent,
        chatVersionByAgent,
        position,
        open,
        close,
        toggle,
        setExpanded,
        setSelectedAgent,
        setConversationId,
        startNewConversation,
        setUnread,
        setPosition,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAgentChat() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useAgentChat must be used inside AgentChatProvider")
  return v
}
