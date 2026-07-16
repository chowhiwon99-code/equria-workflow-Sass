"use client"

import { useEffect, useRef, useState } from "react"
import { Sparkles, Check, ArrowLeft, PenLine, Plug, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import {
  WIZARD_FIELDS,
  OUTPUT_FORMATS,
  inferCategory,
  recommendOutputFormat,
  type WizardField,
  type WizardInputs,
} from "@/lib/agentBuilder"
import { AgentBuilderForm } from "@/components/agents/AgentBuilderForm"
import { KnowledgeFilePicker } from "@/components/agents/KnowledgeFilePicker"
import { McpConnectorPicker } from "@/components/agents/McpConnectorPicker"
import type { StagedKnowledge } from "@/lib/agentKnowledge"

type Mode = "wizard" | "manual"
type Phase = "gallery" | "input" | "result"

// 한 화면에 한 질문씩 — 아이폰 초기 설정처럼 가로 슬라이드로 진행.
const QUESTIONS = WIZARD_FIELDS

// 진입 화면 배경에 떠다니는 에이전트 아이콘(장식·클릭 불가). 중앙 입력을 피해 가장자리에 흩뿌린다.
const FLOAT_ICONS = [
  { e: "📄", pos: "left-[3%] top-[3%]", delay: "0s", dur: "2.6s", size: "2.2rem" },
  { e: "💬", pos: "right-[5%] top-[8%]", delay: "0.7s", dur: "2.9s", size: "2rem" },
  { e: "🌐", pos: "left-[6%] top-[52%]", delay: "1.3s", dur: "3.1s", size: "2.4rem" },
  { e: "📊", pos: "right-[4%] top-[60%]", delay: "0.4s", dur: "2.7s", size: "2rem" },
  { e: "📱", pos: "left-[15%] top-[27%]", delay: "1s", dur: "3.3s", size: "1.7rem" },
  { e: "⚖️", pos: "right-[12%] top-[33%]", delay: "1.7s", dur: "2.5s", size: "1.7rem" },
  { e: "🧾", pos: "left-[45%] top-[88%]", delay: "0.9s", dur: "3s", size: "1.8rem" },
] as const

export function AgentWizard({ mcpPrefill }: { mcpPrefill?: string[] } = {}) {
  const [mode, setMode] = useState<Mode>("wizard")
  // /mcp에서 진입(커넥터 프리필)하면 갤러리 건너뛰고 바로 위저드; 그 외엔 예시 갤러리부터.
  const [phase, setPhase] = useState<Phase>(mcpPrefill?.length ? "input" : "gallery")
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1) // 슬라이드 방향(다음=1 오른쪽에서 / 이전=-1 왼쪽에서)
  const [inputs, setInputs] = useState<WizardInputs>({})
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [generated, setGenerated] = useState("")
  const [knowledge, setKnowledge] = useState<StagedKnowledge[]>([]) // 필요한 데이터 스텝에서 첨부한 파일

  const setText = (key: string, v: string) => setInputs((p) => ({ ...p, [key]: v }))
  const toggleMulti = (key: string, opt: string) =>
    setInputs((p) => {
      const cur = (p[key] as string[]) ?? []
      return { ...p, [key]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] }
    })

  const filled = (f: WizardField) => {
    const v = inputs[f.key]
    return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim())
  }

  const current = QUESTIONS[index]
  const isLast = index === QUESTIONS.length - 1
  const canNext = !current.required || filled(current)

  // 가드는 '다음' 버튼 disabled + 텍스트 Enter 인라인 검증으로 — 여기선 무가드(select 자동넘김의 stale 방지)
  const goNext = () => {
    if (isLast) {
      void generate()
      return
    }
    setDir(1)
    setIndex((i) => Math.min(QUESTIONS.length - 1, i + 1))
  }
  const goPrev = () => {
    setDir(-1)
    setIndex((i) => Math.max(0, i - 1))
  }

  const generate = async (inputsArg: WizardInputs = inputs) => {
    setPhase("result")
    setGenerating(true)
    setGenError(null)
    setGenerated("")
    try {
      const res = await fetch("/api/agents/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: inputsArg }),
      })
      if (!res.ok || !res.body) {
        throw new Error(res.status === 401 ? "로그인이 필요합니다." : `생성 실패 (${res.status})`)
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let acc = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += dec.decode(value, { stream: true })
        setGenerated(acc)
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.")
    } finally {
      setGenerating(false)
    }
  }

  // ── 직접 작성 모드(파워유저 / 기존 흐름 보존) ──
  if (mode === "manual") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <button
          type="button"
          onClick={() => setMode("wizard")}
          className="inline-flex items-center gap-1.5 self-start rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[var(--shadow-sm)] transition-colors hover:bg-muted hover:text-foreground"
        >
          <Sparkles className="size-3.5" /> 가이드 마법사로 돌아가기
        </button>
        <AgentBuilderForm slides prefill={mcpPrefill?.length ? { mcp_servers: mcpPrefill } : undefined} />
      </div>
    )
  }

  // ── 진입: "무슨 일을 맡기고 싶은지" 열린 입력 + 떠다니는 에이전트 아이콘(장식). 예시 없음. ──
  if (phase === "gallery") {
    const seed = ((inputs.purpose as string) ?? "").trim()
    const startFromSeed = () => {
      setPhase("input")
      setIndex(0)
    }
    return (
      <div className="relative isolate mx-auto flex w-full max-w-2xl flex-col items-center gap-6 pt-2">
        {/* 떠다니는 에이전트 아이콘 — "이런 걸 만들어 쓸 수 있다"는 분위기(장식·클릭 불가) */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          {FLOAT_ICONS.map((i) => (
            <span
              key={i.e}
              className={cn("absolute select-none opacity-[0.16] motion-safe:animate-float", i.pos)}
              style={{ animationDelay: i.delay, animationDuration: i.dur, fontSize: i.size }}
            >
              {i.e}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setMode("manual")}
          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-xs font-medium text-muted-foreground shadow-[var(--shadow-sm)] transition-colors hover:bg-muted hover:text-foreground"
        >
          <PenLine className="size-3.5" /> 직접 작성으로 전환
        </button>

        <div className="flex flex-col items-center gap-1.5 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">어떤 일을 맡기고 싶으세요?</h2>
          <p className="text-sm text-muted-foreground">평소 반복하는 업무를 편하게 적어주면, 몇 가지만 물어보고 AI가 맞춰 만들어줘요.</p>
        </div>

        {/* 메인 = 열린 입력 */}
        <div className="w-full">
          <textarea
            autoFocus
            value={(inputs.purpose as string) ?? ""}
            onChange={(e) => setText("purpose", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && seed) {
                e.preventDefault()
                startFromSeed()
              }
            }}
            placeholder="예: 매주 거래처에 보내는 안내 메일을 대신 써줘 · 영수증 정리하고 부가세 빠진 것 짚어줘"
            rows={3}
            className={cn(fieldClass, "min-h-[96px] w-full resize-y rounded-2xl py-3 text-base")}
          />
          <div className="mt-2.5 flex justify-end">
            <Button size="sm" disabled={!seed} onClick={startFromSeed}>
              <Sparkles className="size-4" /> 이걸로 만들기
            </Button>
          </div>
        </div>

      </div>
    )
  }

  // ── 결과: AI 생성 + 검토/저장 (기존 흐름) ──
  if (phase === "result") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {generating || genError || !generated ? (
          <div className="flex flex-col gap-3 rounded-xl glass p-4">
            {generating && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Sparkles className="size-3.5" /> AI가 시스템 프롬프트를 작성하는 중…
              </p>
            )}
            {genError && <p className="text-sm text-destructive">{genError}</p>}
            <pre className="max-h-[320px] min-h-[120px] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-mono text-[13px] leading-relaxed">
              {generated || (generating ? "" : "내용이 없습니다.")}
              {generating && <span className="animate-pulse">▍</span>}
            </pre>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setPhase("input")}>
                <ArrowLeft className="size-4" /> 입력 수정
              </Button>
              {!generating && (
                <Button size="sm" onClick={() => generate()}>
                  다시 생성
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-3.5" /> AI가 초안을 만들었어요. 아래에서 검토·수정 후 저장하세요.
              </span>
              <button type="button" onClick={() => generate()} className="underline hover:text-foreground">
                다시 생성
              </button>
            </div>
            <AgentBuilderForm
              prefill={{
                name: (inputs.agentName as string) || "",
                description: (inputs.purpose as string) || null,
                category: inferCategory(inputs),
                system_prompt: generated,
                ...(mcpPrefill?.length ? { mcp_servers: mcpPrefill } : {}),
                ...(((inputs.mcpConnectors as string[]) ?? []).length
                  ? { mcp_connectors: inputs.mcpConnectors as string[] }
                  : {}),
                ...(knowledge.length ? { knowledge } : {}),
              }}
              onBack={() => setPhase("input")}
            />
          </div>
        )}
      </div>
    )
  }

  // ── 입력: 한 질문씩 가로 슬라이드 ──
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 pt-2">
      {/* 직접 작성 전환 — 상단 중앙 */}
      <button
        type="button"
        onClick={() => setMode("manual")}
        className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-xs font-medium text-muted-foreground shadow-[var(--shadow-sm)] transition-colors hover:bg-muted hover:text-foreground"
      >
        <PenLine className="size-3.5" /> 직접 작성으로 전환
      </button>

      {/* /mcp 바로가기로 진입 — MCP 도구가 미리 연결된 채 만들어진다는 안내 */}
      {(mcpPrefill?.length ?? 0) > 0 && (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground">
          <Plug className="size-3.5" /> 선택한 MCP 커넥터가 이 에이전트에 미리 연결돼요.
        </p>
      )}

      {/* 진행바 */}
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">
            {index + 1} / {QUESTIONS.length}
          </span>
          <span>{current.step === 1 ? "기본 정보" : "상세 입력"}</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: `${((index + 1) / QUESTIONS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* 슬라이드 — 활성 질문 1개만 렌더(높이=현재 질문) + 좌우 슬라이드-인. 빈공간 없이 내비가 바로 아래 붙음 */}
      <div className="w-full overflow-hidden px-2">
        <div
          key={index}
          className="motion-safe:animate-[wizard-slide_0.42s_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{ ["--wiz-dir" as string]: dir }}
        >
          <QuestionSlide
            field={current}
            active
            inputs={inputs}
            onText={setText}
            onToggle={toggleMulti}
            onAdvance={goNext}
            knowledge={knowledge}
            onKnowledgeChange={setKnowledge}
          />
        </div>
      </div>

      {/* 내비게이션 */}
      <div className="flex w-full items-center justify-between">
        {index > 0 ? (
          <Button variant="outline" size="sm" onClick={goPrev}>
            <ArrowLeft className="size-4" /> 이전
          </Button>
        ) : (
          <span />
        )}
        <Button size="sm" onClick={goNext} disabled={!canNext}>
          {isLast ? (
            <>
              <Sparkles className="size-4" /> AI로 생성
            </>
          ) : (
            "다음"
          )}
        </Button>
      </div>
    </div>
  )
}

function QuestionSlide({
  field: f,
  active,
  inputs,
  onText,
  onToggle,
  onAdvance,
  knowledge,
  onKnowledgeChange,
}: {
  field: WizardField
  active: boolean
  inputs: WizardInputs
  onText: (key: string, v: string) => void
  onToggle: (key: string, opt: string) => void
  onAdvance: () => void
  knowledge: StagedKnowledge[]
  onKnowledgeChange: (next: StagedKnowledge[]) => void
}) {
  const inputRef = useRef<HTMLElement | null>(null)
  const value = inputs[f.key]
  const [custom, setCustom] = useState("") // multiselect 직접 추가 입력

  // 슬라이드 전환이 끝난 뒤 활성 슬라이드의 텍스트 입력에 포커스
  useEffect(() => {
    if (!active) return
    if (f.type !== "text" && f.type !== "textarea") return
    const t = window.setTimeout(() => inputRef.current?.focus(), 520)
    return () => window.clearTimeout(t)
  }, [active, f.type])

  return (
    <div className="flex min-h-[240px] flex-col gap-5 py-1">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          {f.label}
          {f.required && <span className="text-primary"> *</span>}
        </h2>
        {f.hint ? (
          <p className="text-sm text-muted-foreground">{f.hint}</p>
        ) : f.type === "select" || f.type === "multiselect" ? (
          <p className="text-sm text-muted-foreground">
            {f.type === "multiselect" ? "해당하는 항목을 모두 골라주세요." : "하나를 고르면 다음으로 넘어가요."}
          </p>
        ) : f.placeholder && (f.type === "text" || f.type === "textarea") ? (
          <p className="text-sm text-muted-foreground">{f.placeholder}</p>
        ) : null}
      </div>

      {f.type === "text" && (
        <input
          ref={(el) => {
            inputRef.current = el
          }}
          className={cn(fieldClass, "h-12 rounded-xl text-base")}
          value={(value as string) ?? ""}
          onChange={(e) => onText(f.key, e.target.value)}
          placeholder={f.placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (!f.required || String((value as string) ?? "").trim()) onAdvance()
            }
          }}
        />
      )}

      {f.type === "textarea" && (
        <textarea
          ref={(el) => {
            inputRef.current = el
          }}
          className={cn(fieldClass, "min-h-[140px] resize-y rounded-xl py-2.5 text-base")}
          value={(value as string) ?? ""}
          onChange={(e) => onText(f.key, e.target.value)}
          placeholder={f.placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              if (!f.required || String((value as string) ?? "").trim()) onAdvance()
            }
          }}
        />
      )}

      {/* 출력 형식 — 업무언어 단일선택 + 미니 예시 + 직무기반 추천 */}
      {f.key === "outputFormat" &&
        (() => {
          const selected = (value as string) ?? ""
          const recommended = recommendOutputFormat(inputs.jobRole as string | undefined)
          const isCustom = !!selected && !OUTPUT_FORMATS.some((o) => o.value === selected)
          return (
            <div className="flex flex-col gap-2">
              {OUTPUT_FORMATS.map((o) => {
                const on = selected === o.value
                const rec = o.value === recommended
                return (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => {
                      onText(f.key, o.value)
                      window.setTimeout(onAdvance, 160) // 선택 표시 후 스윽 넘어감
                    }}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border px-4 py-3 text-left transition-colors",
                      on ? "border-primary bg-primary/5" : "hover:bg-muted"
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {o.label}
                      {rec && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          추천
                        </span>
                      )}
                      {on && <Check className="ml-auto size-4 text-primary" />}
                    </span>
                    <span className="text-xs text-muted-foreground">{o.desc}</span>
                    <span className="mt-0.5 rounded-md bg-muted/50 px-2 py-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {o.example}
                    </span>
                  </button>
                )
              })}
              {/* 직접 입력 — 원하는 형식이 없으면 자유롭게(틀에 안 갇히게) */}
              <input
                className={cn(
                  fieldClass,
                  "mt-1 h-11 rounded-xl text-sm",
                  isCustom && "border-primary bg-primary/5"
                )}
                placeholder="원하는 형식을 직접 입력하고 Enter"
                value={isCustom ? selected : ""}
                onChange={(e) => onText(f.key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && selected.trim()) {
                    e.preventDefault()
                    onAdvance()
                  }
                }}
              />
            </div>
          )
        })()}

      {f.type === "select" && f.key !== "outputFormat" && (
        <div className="flex flex-col gap-2">
          {f.options!.map((o) => {
            const on = value === o
            return (
              <button
                type="button"
                key={o}
                onClick={() => {
                  onText(f.key, o)
                  window.setTimeout(onAdvance, 140) // 선택 표시 후 스윽 넘어감
                }}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                  on ? "border-primary bg-primary/5 text-foreground" : "hover:bg-muted"
                )}
              >
                {o}
                {on && <Check className="size-4 text-primary" />}
              </button>
            )
          })}
          {/* 직접 입력 — 목록에 없으면 자유롭게 작성(틀에 안 갇히게) */}
          <input
            className={cn(
              fieldClass,
              "mt-1 h-11 rounded-xl text-sm",
              value && !f.options!.includes(value as string) && "border-primary bg-primary/5"
            )}
            placeholder="목록에 없으면 직접 입력하고 Enter"
            value={f.options!.includes(value as string) ? "" : ((value as string) ?? "")}
            onChange={(e) => onText(f.key, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && String((value as string) ?? "").trim()) {
                e.preventDefault()
                onAdvance()
              }
            }}
          />
        </div>
      )}

      {f.type === "multiselect" &&
        (() => {
          const selected = (value as string[]) ?? []
          const customs = selected.filter((v) => !f.options!.includes(v))
          const addCustom = () => {
            const v = custom.trim()
            if (v && !selected.includes(v)) onToggle(f.key, v)
            setCustom("")
          }
          return (
            <div className="flex flex-col items-center gap-3">
              <div className="flex flex-wrap justify-center gap-2">
                {f.options!.map((o) => {
                  const on = selected.includes(o)
                  return (
                    <button
                      type="button"
                      key={o}
                      onClick={() => onToggle(f.key, o)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                        on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                      )}
                    >
                      {o}
                    </button>
                  )
                })}
                {/* 직접 추가한(프리셋에 없는) 값 — 클릭하면 제거 */}
                {customs.map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => onToggle(f.key, v)}
                    className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-3.5 py-1.5 text-sm text-primary transition-colors hover:bg-primary/20"
                    title="제거"
                  >
                    {v} <X className="size-3.5" />
                  </button>
                ))}
              </div>
              {/* 직접 입력 — 목록에 없는 업무영역을 자유롭게 추가 */}
              <div className="flex w-full max-w-xs items-center gap-1.5">
                <input
                  className={cn(fieldClass, "h-9 rounded-full text-sm")}
                  placeholder="직접 입력하고 Enter (예: 재고 관리)"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      addCustom()
                    }
                  }}
                />
                <Button type="button" size="sm" variant="outline" onClick={addCustom} disabled={!custom.trim()}>
                  추가
                </Button>
              </div>
            </div>
          )
        })()}

      {/* MCP 연결 스텝 — 내가 연결한 도구(Notion 등)를 골라 이 에이전트에 붙임 */}
      {f.type === "mcp" && (
        <McpConnectorPicker value={(value as string[]) ?? []} onToggle={(id) => onToggle(f.key, id)} />
      )}

      {/* 필요한 데이터 스텝 — AI가 읽을 파일 첨부(PDF·이미지·문서) */}
      {f.key === "requiredData" && (
        <div className="w-full">
          <KnowledgeFilePicker value={knowledge} onChange={onKnowledgeChange} />
        </div>
      )}
    </div>
  )
}
