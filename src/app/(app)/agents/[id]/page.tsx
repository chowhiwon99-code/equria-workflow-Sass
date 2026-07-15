"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Pin, Lock, Globe, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { useUndo } from "@/components/undo/UndoProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { BackLink } from "@/components/shared/BackLink"
import { renderAgentIcon } from "@/components/agents/AgentIcon"
import { AGENT_CATEGORIES, AGENT_MODELS, TEMPERATURE_PRESETS } from "@/lib/agents"
import type { Tables } from "@/lib/supabase/types"

type AgentDetail = Tables<"agents">
type Version = { system_prompt: string; model: string; max_tokens: number; temperature: number }

/** 상세 뷰 — 누구나 열람(기본·공유·내 에이전트). 소유자는 수정 가능. 실제 대화는 위젯에서. */
export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const router = useRouter()
  const { push } = useUndo()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [version, setVersion] = useState<Version | null>(null)
  const meId = useCurrentUserId()
  const [pinned, setPinned] = useState(false)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: ag } = await supabase
        .from("agents")
        .select("*")
        .eq("id", id)
        .eq("is_active", true)
        .maybeSingle()
      if (!ag) {
        setMissing(true)
        setLoading(false)
        return
      }
      setAgent(ag)
      const [{ data: cur }, { data: pin }] = await Promise.all([
        supabase
          .from("agent_versions")
          .select("system_prompt, model, max_tokens, temperature")
          .eq("agent_id", id)
          .eq("is_current", true)
          .maybeSingle(),
        supabase.from("user_agent_pins").select("agent_id").eq("agent_id", id).maybeSingle(),
      ])
      if (cur) {
        setVersion({
          system_prompt: cur.system_prompt,
          model: cur.model,
          max_tokens: cur.max_tokens,
          temperature: Number(cur.temperature),
        })
      }
      setPinned(!!pin)
      setLoading(false)
    })()
  }, [supabase, id])

  const togglePin = useCallback(async () => {
    if (!meId || !agent) return
    const next = !pinned
    setPinned(next) // 낙관적
    try {
      if (next) await mustOk(supabase.from("user_agent_pins").insert({ user_id: meId, agent_id: agent.id }))
      else await mustOk(supabase.from("user_agent_pins").delete().eq("user_id", meId).eq("agent_id", agent.id))
      window.dispatchEvent(new Event("equria:agents-changed"))
    } catch {
      setPinned(!next) // 실패 시 롤백
    }
  }, [supabase, meId, agent, pinned])

  const remove = async () => {
    if (!agent) return
    if (!confirm("이 에이전트를 삭제할까요? (위젯에서도 사라집니다 · ⌘Z로 복구 가능)")) return
    const agentId = agent.id
    try {
      await mustOk(supabase.from("agents").update({ is_active: false }).eq("id", agentId))
    } catch {
      return
    }
    push({
      label: "에이전트 삭제",
      undo: async () => {
        await mustOk(supabase.from("agents").update({ is_active: true }).eq("id", agentId))
        window.dispatchEvent(new Event("equria:agents-changed"))
      },
      redo: async () => {
        await mustOk(supabase.from("agents").update({ is_active: false }).eq("id", agentId))
        window.dispatchEvent(new Event("equria:agents-changed"))
      },
    })
    window.dispatchEvent(new Event("equria:agents-changed"))
    router.push("/agents")
  }

  if (loading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>
  if (missing || !agent)
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/agents" label="에이전트 관리" />
        <p className="text-sm text-muted-foreground">에이전트를 찾을 수 없습니다.</p>
      </div>
    )

  const isOwner = agent.created_by === meId
  const categoryLabel = AGENT_CATEGORIES.find((c) => c.value === agent.category)?.label ?? agent.category
  const modelLabel = version ? AGENT_MODELS.find((m) => m.value === version.model)?.label ?? version.model : "—"
  const tempLabel = version
    ? TEMPERATURE_PRESETS.find((t) => t.value === version.temperature)?.label ?? String(version.temperature)
    : "—"

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/agents" label="에이전트 관리" />

      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
            {renderAgentIcon(agent.icon || "lucide:Bot", "size-7")}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{agent.name}</h1>
              {agent.is_public ? (
                <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-label="공유됨" />
              ) : (
                <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="비공개" />
              )}
            </div>
            {agent.description && <p className="truncate text-sm text-muted-foreground">{agent.description}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant={pinned ? "secondary" : "default"} size="sm" onClick={togglePin}>
            <Pin className={cn("size-3.5", pinned && "fill-current")} />
            {pinned ? "위젯에 있음" : "위젯에 추가"}
          </Button>
          {isOwner && (
            <>
              <Button variant="outline" size="sm" onClick={() => router.push(`/agents/${agent.id}/edit`)}>
                <Pencil className="size-3.5" /> 수정
              </Button>
              <Button variant="outline" size="sm" onClick={remove} className="text-destructive hover:text-destructive">
                <Trash2 className="size-3.5" /> 삭제
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 정보 칩 */}
      <div className="flex flex-wrap gap-2">
        <InfoChip label="카테고리" value={categoryLabel} />
        <InfoChip label="모델" value={modelLabel} />
        <InfoChip label="창의성" value={tempLabel} />
        {version && <InfoChip label="최대 토큰" value={version.max_tokens.toLocaleString()} />}
        <InfoChip label="제공" value={isOwner ? "내 에이전트" : agent.created_by ? "공유됨" : "기본 제공"} />
      </div>

      {/* skill.md (시스템 프롬프트) */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">skill.md · 시스템 프롬프트</h2>
        {version?.system_prompt ? (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/40 p-4 font-mono text-[13px] leading-relaxed">
            {version.system_prompt}
          </pre>
        ) : (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            시스템 프롬프트가 없습니다.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        실제 대화는 우하단 위젯(⌘K)에서 — 위젯에 추가하면 바로 쓸 수 있어요.
      </p>
    </div>
  )
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  )
}
