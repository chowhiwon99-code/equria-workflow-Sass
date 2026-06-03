"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { Button } from "@/components/ui/button"
import { BackLink } from "@/components/shared/BackLink"
import { useUndo } from "@/components/undo/UndoProvider"
import { AgentBuilderForm, type AgentFormInitial } from "@/components/agents/AgentBuilderForm"

type VersionRow = {
  id: string
  version: number
  model: string
  is_current: boolean
  created_at: string
}

export default function EditAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const router = useRouter()
  const { push } = useUndo()
  const [initial, setInitial] = useState<AgentFormInitial | null>(null)
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notAllowed, setNotAllowed] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const me = auth.user?.id ?? null
      const { data: agent } = await supabase
        .from("agents")
        .select("*")
        .eq("id", id)
        .eq("is_active", true)
        .maybeSingle()
      if (!agent || agent.created_by !== me) {
        setNotAllowed(true)
        setLoading(false)
        return
      }
      const [{ data: cur }, { data: allV }] = await Promise.all([
        supabase.from("agent_versions").select("*").eq("agent_id", id).eq("is_current", true).maybeSingle(),
        supabase
          .from("agent_versions")
          .select("id, version, model, is_current, created_at")
          .eq("agent_id", id)
          .order("version", { ascending: false }),
      ])
      setVersions((allV as VersionRow[]) ?? [])
      setInitial({
        id: agent.id,
        name: agent.name,
        icon: agent.icon,
        category: agent.category,
        description: agent.description,
        is_public: agent.is_public,
        system_prompt: cur?.system_prompt ?? "",
        model: cur?.model ?? "claude-sonnet-4-6",
        temperature: Number(cur?.temperature ?? 0.7),
        max_tokens: cur?.max_tokens ?? 4096,
        mcp_servers: cur?.mcp_servers ?? [],
      })
      setLoading(false)
    })()
  }, [supabase, id])

  const remove = async () => {
    if (!confirm("이 에이전트를 삭제할까요? (위젯에서도 사라집니다 · ⌘Z로 복구 가능)")) return
    await supabase.from("agents").update({ is_active: false }).eq("id", id)
    push({
      label: "에이전트 삭제",
      undo: async () => {
        await mustOk(supabase.from("agents").update({ is_active: true }).eq("id", id))
        window.dispatchEvent(new Event("equria:agents-changed"))
      },
      redo: async () => {
        await mustOk(supabase.from("agents").update({ is_active: false }).eq("id", id))
        window.dispatchEvent(new Event("equria:agents-changed"))
      },
    })
    window.dispatchEvent(new Event("equria:agents-changed"))
    router.push("/agents")
  }

  if (loading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>
  if (notAllowed || !initial)
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/agents" label="에이전트 관리" />
        <p className="text-sm text-muted-foreground">
          이 에이전트는 수정할 수 없습니다. (내가 만든 에이전트만 편집 가능 — 기본·공유 에이전트는 위젯에 추가해 사용하세요.)
        </p>
      </div>
    )

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/agents" label="에이전트 관리" />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">에이전트 수정</h1>
        <Button variant="destructive" size="sm" onClick={remove}>
          <Trash2 /> 삭제
        </Button>
      </div>

      <AgentBuilderForm initial={initial} />

      {versions.length > 1 && (
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 className="text-sm font-semibold">버전 이력</h2>
          <div className="overflow-hidden rounded-lg border text-sm">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between border-b px-3 py-2 last:border-0">
                <span className="tabular-nums">
                  v{v.version} · <span className="text-muted-foreground">{v.model}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {new Date(v.created_at).toLocaleDateString("ko-KR")}
                  {v.is_current && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">현재</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">프롬프트·모델을 바꿔 저장하면 새 버전이 만들어집니다.</p>
        </div>
      )}
    </div>
  )
}
