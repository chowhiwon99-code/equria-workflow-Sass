"use client"

import { useState } from "react"
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

const STEP_TITLES = ["기본 정보", "상세 입력", "검토 · 저장"] as const

export function AgentWizard() {
  const [mode, setMode] = useState<Mode>("wizard")
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [inputs, setInputs] = useState<WizardInputs>({})
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [generated, setGenerated] = useState("")

  const step1 = WIZARD_FIELDS.filter((f) => f.step === 1)
  const step2 = WIZARD_FIELDS.filter((f) => f.step === 2)

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
  const step1Valid = step1.filter((f) => f.required).every(filled)
  const step2Valid = step2.filter((f) => f.required).every(filled)

  const generate = async () => {
    setGenerating(true)
    setGenError(null)
    setGenerated("")
    setStep(3)
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
        <AgentBuilderForm />
      </div>
    )
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {/* Stepper */}
      <ol className="flex items-center gap-2 text-sm">
        {STEP_TITLES.map((t, i) => {
          const n = (i + 1) as 1 | 2 | 3
          const active = step === n
          const done = step > n
          return (
            <li key={t} className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-xs font-medium",
                  active && "border-primary bg-primary text-primary-foreground",
                  done && "border-primary bg-primary/10 text-primary",
                  !active && !done && "text-muted-foreground"
                )}
              >
                {n}
              </span>
              <span className={cn(active ? "font-medium" : "text-muted-foreground")}>{t}</span>
              {i < STEP_TITLES.length - 1 && <span className="mx-1 text-muted-foreground/40">›</span>}
            </li>
          )
        })}
      </ol>

      {/* Step 1 / 2 — 입력 */}
      {(step === 1 || step === 2) && (
        <div className="flex flex-col gap-4 rounded-xl border p-4">
          {(step === 1 ? step1 : step2).map((f) => (
            <FieldRow key={f.key} field={f} inputs={inputs} onText={setText} onToggle={toggleMulti} />
          ))}
        </div>
      )}

      {/* Step 3 — 생성 + 검토/편집/저장 */}
      {step === 3 &&
        (generating || genError || !generated ? (
          <div className="flex flex-col gap-3 rounded-xl border p-4">
            {generating && (
              <p className="text-sm text-muted-foreground">✨ AI가 시스템 프롬프트를 작성하는 중…</p>
            )}
            {genError && <p className="text-sm text-destructive">{genError}</p>}
            <pre className="max-h-[320px] min-h-[120px] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-mono text-[13px] leading-relaxed">
              {generated || (generating ? "" : "내용이 없습니다.")}
              {generating && <span className="animate-pulse">▍</span>}
            </pre>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                ← 입력 수정
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
              <span>✨ AI가 초안을 만들었어요. 아래에서 검토·수정 후 저장하세요.</span>
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
              onBack={() => setStep(2)}
            />
          </div>
        ))}

      {/* 하단 내비게이션 (Step 1/2 전용 — Step 3은 폼이 버튼을 가짐) */}
      {(step === 1 || step === 2) && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            직접 작성으로 전환
          </button>
          <div className="flex gap-2">
            {step === 2 && (
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                이전
              </Button>
            )}
            {step === 1 && (
              <Button size="sm" onClick={() => setStep(2)} disabled={!step1Valid}>
                다음
              </Button>
            )}
            {step === 2 && (
              <Button size="sm" onClick={generate} disabled={!step2Valid}>
                ✨ AI로 시스템 프롬프트 생성
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FieldRow({
  field,
  inputs,
  onText,
  onToggle,
}: {
  field: WizardField
  inputs: WizardInputs
  onText: (key: string, v: string) => void
  onToggle: (key: string, opt: string) => void
}) {
  const value = inputs[field.key]
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs text-muted-foreground">
        {field.label} {field.required && <span className="text-primary">*</span>}
      </span>

      {field.type === "select" && (
        <select
          className={fieldClass}
          value={(value as string) ?? ""}
          onChange={(e) => onText(field.key, e.target.value)}
        >
          <option value="" disabled>
            선택하세요
          </option>
          {field.options!.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}

      {field.type === "multiselect" && (
        <div className="flex flex-wrap gap-1.5">
          {field.options!.map((o) => {
            const on = ((value as string[]) ?? []).includes(o)
            return (
              <button
                type="button"
                key={o}
                onClick={() => onToggle(field.key, o)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                )}
              >
                {o}
              </button>
            )
          })}
        </div>
      )}

      {field.type === "textarea" && (
        <textarea
          className={cn(fieldClass, "min-h-[88px] resize-y")}
          value={(value as string) ?? ""}
          onChange={(e) => onText(field.key, e.target.value)}
          placeholder={field.placeholder}
        />
      )}

      {field.type === "text" && (
        <input
          className={fieldClass}
          value={(value as string) ?? ""}
          onChange={(e) => onText(field.key, e.target.value)}
          placeholder={field.placeholder}
        />
      )}
    </label>
  )
}
