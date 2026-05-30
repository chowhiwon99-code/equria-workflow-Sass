"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { useUndo } from "@/components/undo/UndoProvider"
import { AGENT_MODELS, AGENT_CATEGORIES, AGENT_DEFAULTS, AGENT_ICON_PRESETS } from "@/lib/agents"

// Take the first user-perceived grapheme cluster (keeps ZWJ sequences, flags,
// skin-tone modifiers intact). Falls back to a code-point-aware slice when
// Intl.Segmenter is unavailable.
function firstGrapheme(s: string): string {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter()
    for (const { segment } of segmenter.segment(s)) return segment
    return ""
  }
  return [...s][0] ?? ""
}

export type AgentFormInitial = {
  id: string
  name: string
  icon: string
  category: string
  description: string | null
  is_public: boolean
  system_prompt: string
  model: string
  temperature: number
  max_tokens: number
}

export function AgentBuilderForm({ initial }: { initial?: AgentFormInitial | null }) {
  const supabase = createClient()
  const router = useRouter()
  const { push } = useUndo()
  const editing = !!initial

  const [name, setName] = useState(initial?.name ?? "")
  const [icon, setIcon] = useState(initial?.icon ?? AGENT_DEFAULTS.icon)
  const [category, setCategory] = useState(initial?.category ?? AGENT_DEFAULTS.category)
  const [description, setDescription] = useState(initial?.description ?? "")
  const [isPublic, setIsPublic] = useState(initial?.is_public ?? false)
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? "")
  const [model, setModel] = useState(initial?.model ?? AGENT_DEFAULTS.model)
  const [temperature, setTemperature] = useState(initial?.temperature ?? AGENT_DEFAULTS.temperature)
  const [maxTokens, setMaxTokens] = useState(initial?.max_tokens ?? AGENT_DEFAULTS.maxTokens)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = name.trim().length > 0 && systemPrompt.trim().length > 0

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      setError("로그인이 필요합니다.")
      setSaving(false)
      return
    }
    const meId = auth.user.id

    if (!editing) {
      // 생성: agents → agent_versions(v1)
      const { data: agent, error: aErr } = await supabase
        .from("agents")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          category,
          icon,
          is_public: isPublic,
          created_by: meId,
        })
        .select("id")
        .single()
      if (aErr || !agent) {
        setError(aErr?.message ?? "에이전트 생성 실패")
        setSaving(false)
        return
      }
      const { error: vErr } = await supabase.from("agent_versions").insert({
        agent_id: agent.id,
        system_prompt: systemPrompt.trim(),
        model,
        temperature,
        max_tokens: maxTokens,
        version: 1,
        is_current: true,
        created_by: meId,
      })
      if (vErr) {
        setError(vErr.message)
        setSaving(false)
        return
      }
      push({
        label: "에이전트 생성",
        undo: async () => {
          await mustOk(supabase.from("agents").update({ is_active: false }).eq("id", agent.id))
          window.dispatchEvent(new Event("equria:agents-changed"))
        },
        redo: async () => {
          await mustOk(supabase.from("agents").update({ is_active: true }).eq("id", agent.id))
          window.dispatchEvent(new Event("equria:agents-changed"))
        },
      })
      window.dispatchEvent(new Event("equria:agents-changed"))
      router.push("/agents")
      return
    }

    // 수정: 메타 업데이트 + (프롬프트/모델/파라미터 변경 시에만) 새 버전 생성
    const { error: uErr } = await supabase
      .from("agents")
      .update({
        name: name.trim(),
        description: description.trim() || null,
        category,
        icon,
        is_public: isPublic,
      })
      .eq("id", initial.id)
    if (uErr) {
      setError(uErr.message)
      setSaving(false)
      return
    }

    const versionChanged =
      systemPrompt.trim() !== initial.system_prompt ||
      model !== initial.model ||
      temperature !== initial.temperature ||
      maxTokens !== initial.max_tokens
    if (versionChanged) {
      // version 은 unique(agent_id, version) 라서 동시 수정 시 select max(version)+1 이
      // 경합한다(둘 다 같은 값 → 두 번째 insert 가 23505). 충돌하면 max 를 다시 읽고
      // 한 번 재시도한다.
      const readNextVersion = async () => {
        const { data: last } = await supabase
          .from("agent_versions")
          .select("version")
          .eq("agent_id", initial.id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle()
        return (last?.version ?? 0) + 1
      }
      const insertVersion = (version: number) =>
        supabase.from("agent_versions").insert({
          agent_id: initial.id,
          system_prompt: systemPrompt.trim(),
          model,
          temperature,
          max_tokens: maxTokens,
          version,
          is_current: true, // 트리거 handle_new_agent_version 가 이전 버전 is_current=false 처리
          created_by: meId,
        })

      let { error: vErr } = await insertVersion(await readNextVersion())
      if (vErr?.code === "23505") {
        ;({ error: vErr } = await insertVersion(await readNextVersion()))
      }
      if (vErr) {
        setError(vErr.message)
        setSaving(false)
        return
      }
    }
    window.dispatchEvent(new Event("equria:agents-changed"))
    router.push("/agents")
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {/* 이름 + 아이콘 */}
      <div className="flex gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">아이콘</span>
          <input
            className={cn(fieldClass, "w-16 text-center text-2xl")}
            value={icon}
            onChange={(e) => setIcon(firstGrapheme(e.target.value))}
            aria-label="아이콘 이모지"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">이름 *</span>
          <input
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 브랜드 카피라이터"
          />
        </label>
      </div>

      {/* 아이콘 프리셋 */}
      <div className="flex flex-wrap gap-1">
        {AGENT_ICON_PRESETS.map((em) => (
          <button
            key={em}
            type="button"
            onClick={() => setIcon(em)}
            className={cn(
              "flex size-8 items-center justify-center rounded-md border text-lg transition-colors hover:bg-muted",
              icon === em && "border-primary bg-primary/10"
            )}
            aria-label={`아이콘 ${em}`}
          >
            {em}
          </button>
        ))}
      </div>

      {/* 카테고리 + 설명 */}
      <div className="flex gap-3">
        <label className="flex w-40 flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">카테고리</span>
          <select className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {AGENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">한 줄 설명</span>
          <input
            className={fieldClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="이 에이전트가 무엇을 하는지"
          />
        </label>
      </div>

      {/* 시스템 프롬프트 */}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs text-muted-foreground">
          시스템 프롬프트 * <span className="text-muted-foreground/70">— 에이전트의 역할·말투·규칙을 정의</span>
        </span>
        <textarea
          className={cn(fieldClass, "min-h-[180px] resize-y font-mono text-[13px] leading-relaxed")}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder={"예: 당신은 이큐리아의 K-뷰티 브랜드 카피라이터입니다.\n- 밝고 트렌디한 말투\n- 인스타그램 캡션은 3줄 이내 + 해시태그 5개"}
        />
      </label>

      {/* 모델 + 파라미터 */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">모델</span>
          <select className={fieldClass} value={model} onChange={(e) => setModel(e.target.value)}>
            {AGENT_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-44 flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">창의성(temperature): {temperature.toFixed(1)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="h-9"
          />
        </label>
        <label className="flex w-32 flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">최대 토큰</span>
          <input
            type="number"
            className={fieldClass}
            value={maxTokens}
            min={256}
            max={8192}
            step={256}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
          />
        </label>
      </div>

      {/* 공유 토글 */}
      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="size-4"
        />
        <div className="flex flex-col">
          <span className="text-sm font-medium">전체 공유</span>
          <span className="text-xs text-muted-foreground">
            {isPublic ? "모든 직원이 이 에이전트를 위젯에 추가해 쓸 수 있습니다." : "나만 사용 (기본값). 켜면 전체에 공개됩니다."}
          </span>
        </div>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => router.push("/agents")}>
          취소
        </Button>
        <Button size="sm" onClick={save} disabled={!valid || saving}>
          {saving ? "저장 중…" : editing ? "변경 저장" : "에이전트 만들기"}
        </Button>
      </div>
    </div>
  )
}
