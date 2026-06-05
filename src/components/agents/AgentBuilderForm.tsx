"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { useUndo } from "@/components/undo/UndoProvider"
import { IconPicker } from "@/components/agents/IconPicker"
import { renderAgentIcon, isLucideIcon } from "@/components/agents/AgentIcon"
import {
  AGENT_MODELS,
  AGENT_CATEGORIES,
  AGENT_DEFAULTS,
  TEMPERATURE_PRESETS,
} from "@/lib/agents"

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
  mcp_servers: string[]
}

// 생성(create) 모드에서 위저드가 넘겨주는 초기값(부분). id 없음.
export type AgentFormPrefill = Partial<Omit<AgentFormInitial, "id">>

export function AgentBuilderForm({
  initial,
  prefill,
  onBack,
}: {
  initial?: AgentFormInitial | null
  prefill?: AgentFormPrefill | null
  onBack?: () => void
}) {
  const supabase = createClient()
  const router = useRouter()
  const { push } = useUndo()
  const editing = !!initial

  const [name, setName] = useState(initial?.name ?? prefill?.name ?? "")
  const [icon, setIcon] = useState(initial?.icon ?? prefill?.icon ?? AGENT_DEFAULTS.icon)
  const [category, setCategory] = useState(
    initial?.category ?? prefill?.category ?? AGENT_DEFAULTS.category
  )
  const [description, setDescription] = useState(
    initial?.description ?? prefill?.description ?? ""
  )
  const [isPublic, setIsPublic] = useState(initial?.is_public ?? prefill?.is_public ?? false)
  const [systemPrompt, setSystemPrompt] = useState(
    initial?.system_prompt ?? prefill?.system_prompt ?? ""
  )
  const [model, setModel] = useState(initial?.model ?? prefill?.model ?? AGENT_DEFAULTS.model)
  const [temperature, setTemperature] = useState(
    initial?.temperature ?? prefill?.temperature ?? AGENT_DEFAULTS.temperature
  )
  const [maxTokens, setMaxTokens] = useState(
    initial?.max_tokens ?? prefill?.max_tokens ?? AGENT_DEFAULTS.maxTokens
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 이 에이전트가 사용할 MCP 서버(도구) 선택
  const [mcpServers, setMcpServers] = useState<string[]>(
    initial?.mcp_servers ?? prefill?.mcp_servers ?? []
  )
  const [availableMcp, setAvailableMcp] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    fetch("/api/mcp/servers")
      .then((r) => (r.ok ? r.json() : { servers: [] }))
      .then((j: { servers?: { id: string; name: string; is_active: boolean }[] }) => {
        setAvailableMcp((j.servers ?? []).filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name })))
      })
      .catch(() => {})
  }, [])
  const toggleMcp = (id: string) =>
    setMcpServers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

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
        mcp_servers: mcpServers,
        version: 1,
        is_current: true,
        created_by: meId,
      })
      if (vErr) {
        setError(vErr.message)
        setSaving(false)
        return
      }
      // 만든 사람 위젯에 자동 핀 → 만들자마자 우하단 위젯에 등장(핀이 SSOT이므로).
      // 실패해도 생성 자체는 유지(best-effort).
      await supabase.from("user_agent_pins").insert({ user_id: meId, agent_id: agent.id })

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

    const mcpKey = (arr: string[]) => JSON.stringify([...arr].sort())
    const versionChanged =
      systemPrompt.trim() !== initial.system_prompt ||
      model !== initial.model ||
      temperature !== initial.temperature ||
      maxTokens !== initial.max_tokens ||
      mcpKey(mcpServers) !== mcpKey(initial.mcp_servers)
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
          mcp_servers: mcpServers,
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
    router.push(`/agents/${initial.id}`) // 수정 후엔 목록이 아니라 해당 에이전트 상세로
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {/* 아이콘 */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">아이콘</span>
        <IconPicker value={icon} onChange={setIcon} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>선택됨</span>
          <span className="text-xl leading-none">{renderAgentIcon(icon, "size-5")}</span>
          <span className="ml-2">이모지 직접 입력</span>
          <input
            className={cn(fieldClass, "w-14 text-center text-lg")}
            value={isLucideIcon(icon) ? "" : icon}
            onChange={(e) => setIcon(firstGrapheme(e.target.value))}
            placeholder="😊"
            aria-label="이모지 직접 입력"
          />
        </div>
      </div>

      {/* 이름 */}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs text-muted-foreground">이름 *</span>
        <input
          className={fieldClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 브랜드 카피라이터"
        />
      </label>

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

      {/* 모델 + 최대 토큰 */}
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

      {/* 창의성 (temperature) — 숫자 대신 이해 가능한 프리셋 */}
      <div className="flex flex-col gap-2 text-sm">
        <span className="text-xs text-muted-foreground">
          창의성 <span className="text-muted-foreground/70">— 답변이 얼마나 자유롭고 다양해질지</span>
        </span>
        <div className="flex gap-2">
          {TEMPERATURE_PRESETS.map((p) => (
            <button
              type="button"
              key={p.value}
              onClick={() => setTemperature(p.value)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-left transition-colors",
                Math.abs(temperature - p.value) < 0.001
                  ? "border-primary bg-primary/10"
                  : "hover:bg-muted"
              )}
            >
              <div className="text-sm font-medium">{p.label}</div>
              <div className="text-[11px] leading-tight text-muted-foreground">{p.desc}</div>
            </button>
          ))}
        </div>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">세부 조정 (temperature: {temperature.toFixed(1)})</summary>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="mt-2 h-9 w-full"
          />
        </details>
      </div>

      {/* MCP 도구 — 등록된 MCP 서버가 있을 때만 노출 */}
      {availableMcp.length > 0 && (
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-xs text-muted-foreground">
            MCP 도구 <span className="text-muted-foreground/70">— 이 에이전트가 대화 중 쓸 외부 도구 서버</span>
          </span>
          <div className="flex flex-col gap-1.5 rounded-lg border p-3">
            {availableMcp.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={mcpServers.includes(s.id)}
                  onChange={() => toggleMcp(s.id)}
                />
                <span>{s.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

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
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="mr-auto">
            ← 이전
          </Button>
        )}
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
