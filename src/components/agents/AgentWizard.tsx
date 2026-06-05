"use client"

import { useEffect, useRef, useState } from "react"
import { Sparkles, Check, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import {
  WIZARD_FIELDS,
  inferCategory,
  type WizardField,
  type WizardInputs,
} from "@/lib/agentBuilder"
import { AgentBuilderForm } from "@/components/agents/AgentBuilderForm"

type Mode = "wizard" | "manual"
type Phase = "input" | "result"

// 한 화면에 한 질문씩 — 아이폰 초기 설정처럼 가로 슬라이드로 진행.
const QUESTIONS = WIZARD_FIELDS

export function AgentWizard() {
  const [mode, setMode] = useState<Mode>("wizard")
  const [phase, setPhase] = useState<Phase>("input")
  const [index, setIndex] = useState(0)
  const [inputs, setInputs] = useState<WizardInputs>({})
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [generated, setGenerated] = useState("")

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
    setIndex((i) => Math.min(QUESTIONS.length - 1, i + 1))
  }
  const goPrev = () => setIndex((i) => Math.max(0, i - 1))

  const generate = async () => {
    setPhase("result")
    setGenerating(true)
    setGenError(null)
    setGenerated("")
    try {
      const res = await fetch("/api/agents/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs }),
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
      <div className="flex max-w-2xl flex-col gap-4">
        <button
          type="button"
          onClick={() => setMode("wizard")}
          className="self-start text-sm text-muted-foreground hover:text-foreground"
        >
          ← 가이드 마법사로 돌아가기
        </button>
        <AgentBuilderForm slides />
      </div>
    )
  }

  // ── 결과: AI 생성 + 검토/저장 (기존 흐름) ──
  if (phase === "result") {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        {generating || genError || !generated ? (
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
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
                <Button size="sm" onClick={generate}>
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
              <button type="button" onClick={generate} className="underline hover:text-foreground">
                다시 생성
              </button>
            </div>
            <AgentBuilderForm
              prefill={{
                name: (inputs.agentName as string) || "",
                description: (inputs.purpose as string) || null,
                category: inferCategory(inputs),
                system_prompt: generated,
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
    <div className="flex max-w-xl flex-col gap-6">
      {/* 진행바 */}
      <div className="flex flex-col gap-2 px-2">
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

      {/* 슬라이드 트랙 */}
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {QUESTIONS.map((f, i) => (
            <div
              key={f.key}
              className={cn(
                "w-full shrink-0 px-2 transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                i === index ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
              aria-hidden={i !== index}
            >
              <QuestionSlide
                field={f}
                active={i === index}
                inputs={inputs}
                onText={setText}
                onToggle={toggleMulti}
                onAdvance={goNext}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 내비게이션 */}
      <div className="flex items-center justify-between px-2">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          직접 작성으로 전환
        </button>
        <div className="flex gap-2">
          {index > 0 && (
            <Button variant="outline" size="sm" onClick={goPrev}>
              <ArrowLeft className="size-4" /> 이전
            </Button>
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
}: {
  field: WizardField
  active: boolean
  inputs: WizardInputs
  onText: (key: string, v: string) => void
  onToggle: (key: string, opt: string) => void
  onAdvance: () => void
}) {
  const inputRef = useRef<HTMLElement | null>(null)
  const value = inputs[f.key]

  // 슬라이드 전환이 끝난 뒤 활성 슬라이드의 텍스트 입력에 포커스
  useEffect(() => {
    if (!active) return
    if (f.type !== "text" && f.type !== "textarea") return
    const t = window.setTimeout(() => inputRef.current?.focus(), 520)
    return () => window.clearTimeout(t)
  }, [active, f.type])

  return (
    <div className="flex min-h-[280px] flex-col gap-4 py-1">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-tight">
          {f.label}
          {f.required && <span className="text-primary"> *</span>}
        </h2>
        {(f.type === "select" || f.type === "multiselect") && (
          <p className="text-sm text-muted-foreground">
            {f.type === "multiselect" ? "해당하는 항목을 모두 골라주세요." : "하나를 고르면 다음으로 넘어가요."}
          </p>
        )}
        {f.placeholder && (f.type === "text" || f.type === "textarea") && (
          <p className="text-sm text-muted-foreground">{f.placeholder}</p>
        )}
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

      {f.type === "select" && (
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
        </div>
      )}

      {f.type === "multiselect" && (
        <div className="flex flex-wrap gap-2">
          {f.options!.map((o) => {
            const on = ((value as string[]) ?? []).includes(o)
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
        </div>
      )}
    </div>
  )
}
