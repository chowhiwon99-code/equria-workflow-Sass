"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUp, ArrowDown, Trash2, Plus, Play } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { useUndo } from "@/components/undo/UndoProvider"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { BackLink } from "@/components/shared/BackLink"
import { fieldClass } from "@/components/shared/Modal"
import { normalizeSteps, genStepId, type WorkflowStep } from "@/lib/workflows"

type AgentOpt = { id: string; name: string; icon: string }

export function WorkflowEditor({ id }: { id: string }) {
  const supabase = createClient()
  const router = useRouter()
  const { push } = useUndo()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [agents, setAgents] = useState<AgentOpt[]>([])
  const [pickAgent, setPickAgent] = useState("")

  const load = useCallback(async () => {
    const [{ data: wf }, { data: ag }] = await Promise.all([
      supabase.from("workflows").select("name, description, steps, is_active").eq("id", id).maybeSingle(),
      supabase.from("agents").select("id, name, icon").eq("is_active", true).order("created_at", { ascending: true }),
    ])
    if (!wf || wf.is_active === false) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setName(wf.name ?? "")
    setDescription(wf.description ?? "")
    setSteps(normalizeSteps(wf.steps))
    setAgents((ag as AgentOpt[]) ?? [])
    setLoading(false)
  }, [supabase, id])

  useEffect(() => {
    load()
  }, [load])

  const addStep = () => {
    const a = agents.find((x) => x.id === pickAgent)
    if (!a) return
    setSteps((s) => [...s, { id: genStepId(), agent_id: a.id, agent_name: a.name, note: "" }])
    setPickAgent("")
  }
  const removeStep = (sid: string) => setSteps((s) => s.filter((x) => x.id !== sid))
  const move = (i: number, dir: -1 | 1) =>
    setSteps((s) => {
      const j = i + dir
      if (j < 0 || j >= s.length) return s
      const next = [...s]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const setNote = (sid: string, note: string) =>
    setSteps((s) => s.map((x) => (x.id === sid ? { ...x, note } : x)))

  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await mustOk(
        supabase
          .from("workflows")
          .update({
            name: name.trim(),
            description: description.trim() || null,
            steps: steps.map((s) => ({
              id: s.id,
              agent_id: s.agent_id,
              agent_name: s.agent_name,
              note: s.note || undefined,
            })),
          })
          .eq("id", id)
      )
      toast.success("저장했어요.")
      window.dispatchEvent(new Event("equria:reload"))
    } catch {
      toast.error("저장에 실패했어요.")
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    push({
      label: "워크플로우 삭제",
      undo: async () => {
        await mustOk(supabase.from("workflows").update({ is_active: true }).eq("id", id))
        window.dispatchEvent(new Event("equria:reload"))
      },
      redo: async () => {
        await mustOk(supabase.from("workflows").update({ is_active: false }).eq("id", id))
        window.dispatchEvent(new Event("equria:reload"))
      },
    })
    await mustOk(supabase.from("workflows").update({ is_active: false }).eq("id", id))
    window.dispatchEvent(new Event("equria:reload"))
    router.push("/workflows")
  }

  if (loading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>
  if (notFound)
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/workflows" label="워크플로우" />
        <p className="text-sm text-muted-foreground">워크플로우를 찾을 수 없어요.</p>
      </div>
    )

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <BackLink href="/workflows" label="워크플로우" />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs text-muted-foreground">이름 *</span>
        <input
          className={fieldClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 신규 캠페인 콘텐츠 생성"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs text-muted-foreground">설명</span>
        <input
          className={fieldClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="이 워크플로우가 하는 일"
        />
      </label>

      {/* 단계(에이전트 체이닝) */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">단계 (에이전트를 순서대로 실행)</span>
        {steps.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
            아직 단계가 없어요. 아래에서 에이전트를 추가하세요.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={s.id} className="flex items-start gap-2 rounded-lg border p-3">
                <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium">
                  {i + 1}
                </span>
                <div className="flex flex-1 flex-col gap-1.5">
                  <span className="text-sm font-medium">{s.agent_name || "(삭제된 에이전트)"}</span>
                  <input
                    className={cn(fieldClass, "h-7 text-xs")}
                    value={s.note ?? ""}
                    onChange={(e) => setNote(s.id, e.target.value)}
                    placeholder="이 단계 지시(선택)"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="위로"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === steps.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="아래로"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(s.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="단계 삭제"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="flex gap-2">
          <select className={fieldClass} value={pickAgent} onChange={(e) => setPickAgent(e.target.value)}>
            <option value="">에이전트 선택…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={addStep} disabled={!pickAgent}>
            <Plus /> 단계 추가
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <Button
          size="sm"
          variant="ghost"
          onClick={remove}
          className="text-destructive hover:text-destructive"
        >
          삭제
        </Button>
        <div className="flex items-center gap-2">
          <span
            title="실행 기능은 곧 제공됩니다"
            className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs text-muted-foreground opacity-60"
          >
            <Play className="size-3" /> 실행 (곧)
          </span>
          <Button size="sm" onClick={save} disabled={!name.trim() || saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>
    </div>
  )
}
