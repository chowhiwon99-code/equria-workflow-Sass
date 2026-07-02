"use client"

import { useState } from "react"
import { X, Trash2, Loader2, Plus, Search } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { fieldClass } from "@/components/shared/Modal"
import { Button } from "@/components/ui/button"
import { CALC_TEMPLATES, BUILDER_PATTERNS, TEMPLATE_CATEGORIES, templateCategory, formulaToText, evalFormula, type BuilderPattern, type CalcField, type CalcNode } from "@/lib/calcFormula"
import { money } from "@/lib/finance"
import type { CashCalcType } from "@/types"

const WORKSPACE_ID = "00000000-0000-0000-0000-0000000000e1"
const flowLabel = (flow: string) => (flow === "revenue" ? "매출" : flow === "reserve" ? "보유금" : "비용")
// 템플릿 라벨 "이름 — 수식" 분리(표시용).
const splitLabel = (label: string): [string, string] => {
  const i = label.indexOf(" — ")
  return i >= 0 ? [label.slice(0, i), label.slice(i + 3)] : [label, ""]
}

// ── 직접 만들기(스텝 조립) ──
type Operand = { t: "field"; key: string } | { t: "step"; id: string } | { t: "num"; v: number } | { t: "oneMinus"; key: string }
type Step = { id: string; name: string; left: Operand; op: "+" | "-" | "*" | "/"; right: Operand }

function operandNode(o: Operand, resolved: Record<string, CalcNode>): CalcNode {
  if (o.t === "num") return { t: "const", v: o.v }
  if (o.t === "field") return { t: "field", key: o.key }
  if (o.t === "oneMinus") return { t: "op", op: "-", a: { t: "const", v: 1 }, b: { t: "field", key: o.key } }
  return resolved[o.id] ?? { t: "const", v: 0 }
}
function buildAstFromSteps(steps: Step[]): CalcNode | null {
  if (steps.length === 0) return null
  const resolved: Record<string, CalcNode> = {}
  let lastNode: CalcNode = { t: "const", v: 0 }
  for (const st of steps) {
    const node: CalcNode = { t: "op", op: st.op, a: operandNode(st.left, resolved), b: operandNode(st.right, resolved) }
    resolved[st.id] = node
    lastNode = node
  }
  return lastNode
}

// 기존 수식(AST)을 편집 가능한 스텝으로 분해 — 편집/고급 전환 시 현재 수식을 그대로 보고 바로 고칠 수 있게.
function astToSteps(ast: CalcNode | null): Step[] {
  if (!ast) return []
  if (ast.t === "field") return [{ id: "e0", name: "금액", left: { t: "field", key: ast.key }, op: "+", right: { t: "num", v: 0 } }]
  if (ast.t === "const") return [{ id: "e0", name: "금액", left: { t: "num", v: ast.v }, op: "+", right: { t: "num", v: 0 } }]
  const steps: Step[] = []
  let i = 0
  const operand = (n: CalcNode): Operand => {
    if (n.t === "field") return { t: "field", key: n.key }
    if (n.t === "const") return { t: "num", v: n.v }
    if (n.op === "-" && n.a.t === "const" && n.a.v === 1 && n.b.t === "field") return { t: "oneMinus", key: n.b.key } // (1 − 필드)
    const left = operand(n.a)
    const right = operand(n.b)
    const id = `e${i++}`
    steps.push({ id, name: `스텝${steps.length + 1}`, left, op: n.op, right })
    return { t: "step", id }
  }
  operand(ast)
  return steps
}

/**
 * 회사가 계산 유형(필드+수식)을 직접 정의.
 * ① 템플릿에서 시작(업종 카테고리·검색) ② 직접 만들기(흔한 패턴 고르고 칸 채우기, 고급=스텝 조립). 미리보기 후 저장.
 */
export function CalcTypeBuilder({ types, editType, onClose, onSaved }: { types: CashCalcType[]; editType?: CashCalcType | null; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const me = useCurrentUserId()
  const isEdit = !!editType
  const [mode, setMode] = useState<"template" | "custom">(editType ? "custom" : "template")
  const [name, setName] = useState(editType?.name ?? "")
  const [flow, setFlow] = useState<"revenue" | "expense" | "reserve">((editType?.flow as "revenue" | "expense" | "reserve") ?? "expense")
  const [fields, setFields] = useState<CalcField[]>((editType?.fields as unknown as CalcField[]) ?? [])
  const [templateAst, setTemplateAst] = useState<CalcNode | null>(null)
  const [steps, setSteps] = useState<Step[]>(() => astToSteps((editType?.formula as { ast?: CalcNode } | null)?.ast ?? null))
  const [seq, setSeq] = useState(100)
  const [busy, setBusy] = useState(false)
  // 템플릿 탐색
  const [tplCat, setTplCat] = useState<string>("전체")
  const [tplQuery, setTplQuery] = useState("")
  // 커스텀: 선택 패턴 id("custom"=고급 스텝, null=미선택)
  const [patternId, setPatternId] = useState<string | null>(editType ? "custom" : null)
  const [patternAst, setPatternAst] = useState<CalcNode | null>(null)

  const editAst = (editType?.formula as { ast?: CalcNode } | null)?.ast ?? null
  const isPattern = mode === "custom" && !!patternId && patternId !== "custom"
  const isAdvanced = mode === "custom" && patternId === "custom"
  const ast = mode === "template" ? templateAst : isPattern ? patternAst : isAdvanced && isEdit && steps.length === 0 ? editAst : buildAstFromSteps(steps)
  const ready = ast != null && fields.length > 0
  const showDetail = (mode === "template" && !!templateAst) || (mode === "custom" && !!patternId)

  // 템플릿
  const tplList = CALC_TEMPLATES.filter((t) => {
    if (tplCat !== "전체" && templateCategory(t.id) !== tplCat) return false
    const q = tplQuery.trim().toLowerCase()
    return !q || t.label.toLowerCase().includes(q)
  })
  const pickTemplate = (id: string) => {
    const t = CALC_TEMPLATES.find((x) => x.id === id)
    if (!t) return
    setName((n) => n || splitLabel(t.label)[0])
    setFlow(t.flow)
    setFields(t.fields.map((x) => ({ ...x })))
    setTemplateAst(t.ast)
  }

  // 모드/패턴
  const switchMode = (m: "template" | "custom") => {
    setMode(m)
    setFields([])
    setTemplateAst(null)
    setSteps([])
    setPatternId(null)
    setPatternAst(null)
  }
  const pickPattern = (p: BuilderPattern) => {
    const keys = p.slots.map((_, i) => `f${seq + i}`)
    setSeq((s) => s + p.slots.length)
    setFields(p.slots.map((s, i) => ({ key: keys[i], label: s.label, kind: s.kind })))
    setPatternAst(p.build(keys))
    setSteps([])
    setPatternId(p.id)
  }
  const pickAdvanced = () => {
    const seed = patternAst ?? editAst
    if (seed) setSteps(astToSteps(seed))
    setPatternAst(null)
    setPatternId("custom")
  }

  const addField = () => {
    const key = `f${seq}`
    setSeq((s) => s + 1)
    setFields((fs) => [...fs, { key, label: `필드${fs.length + 1}`, kind: "number" }])
  }
  const updField = (key: string, patch: Partial<CalcField>) => setFields((fs) => fs.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  const delField = (key: string) => setFields((fs) => fs.filter((x) => x.key !== key))
  const addStep = () => {
    const id = `s${seq}`
    setSeq((s) => s + 1)
    const first: Operand = fields[0] ? { t: "field", key: fields[0].key } : { t: "num", v: 0 }
    setSteps((ss) => [...ss, { id, name: `스텝${ss.length + 1}`, left: first, op: "*", right: { t: "num", v: 0 } }])
  }
  const updStep = (id: string, patch: Partial<Step>) => setSteps((ss) => ss.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const delStep = (id: string) => setSteps((ss) => ss.filter((x) => x.id !== id))

  const preview = ast ? formulaToText(ast, fields) : ""
  const sample = ast ? evalFormula(ast, Object.fromEntries(fields.map((x) => [x.key, x.kind === "percent" ? 0.1 : 100]))) : 0

  const save = async () => {
    if (!me) return
    if (!name.trim()) return toast.error("유형 이름을 입력해 주세요.")
    if (!ready || !ast) return toast.error(isEdit ? "필드를 1개 이상 두세요." : mode === "template" ? "템플릿을 선택해 주세요." : "계산 방식을 고르고 칸을 채워 주세요.")
    setBusy(true)
    try {
      if (isEdit && editType) {
        await mustOk(supabase.from("cash_calc_types").update({ name: name.trim(), flow, fields, formula: { ast } }).eq("id", editType.id))
        toast.success("계산 칸을 수정했어요.")
        onSaved()
        onClose()
        return
      }
      await mustOk(supabase.from("cash_calc_types").insert({ workspace_id: WORKSPACE_ID, name: name.trim(), flow, fields, formula: { ast }, created_by: me, sort_order: types.length }))
      toast.success("계산 유형을 추가했어요.")
      setName("")
      setTemplateAst(null)
      setFields([])
      setSteps([])
      setPatternId(null)
      setPatternAst(null)
    } catch {
      toast.error("저장에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }
  const del = async (id: string) => {
    await supabase.from("cash_calc_types").delete().eq("id", id)
    onSaved()
  }

  const selCls = "rounded border bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
  const chip = "rounded-full border px-2.5 py-1 text-xs transition-colors"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-2xl border bg-popover p-4 shadow-[var(--shadow-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{isEdit ? "계산 칸·수식 편집" : "계산 유형 만들기"}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
            <X className="size-4" />
          </button>
        </div>

        {/* 모드 토글 (편집모드에선 숨김) */}
        {!isEdit && (
          <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-xs">
            {(["template", "custom"] as const).map((m) => (
              <button key={m} onClick={() => switchMode(m)} className={cn("flex-1 rounded-md py-1.5 font-medium transition-colors", mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}>
                {m === "template" ? "템플릿에서 시작" : "직접 만들기"}
              </button>
            ))}
          </div>
        )}
        {isEdit && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            현재 수식이 아래 <b>수식 스텝</b>으로 펼쳐져 있어요. 칸(필드)을 <b>추가·삭제·이름변경</b>하고, 스텝을 고치거나 <b>+스텝</b>으로 더하면 금액 계산이 바뀝니다. (마지막 스텝 = 최종 금액)
          </p>
        )}

        {/* ── 템플릿에서 시작: 검색 + 카테고리 + 목록 ── */}
        {mode === "template" && (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={tplQuery} onChange={(e) => setTplQuery(e.target.value)} placeholder="템플릿 검색 (예: 구독, 마진, 수수료)" className="h-8 w-full rounded-lg border bg-background pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="flex flex-wrap gap-1">
              {["전체", ...TEMPLATE_CATEGORIES].map((cat) => (
                <button key={cat} onClick={() => setTplCat(cat)} className={cn(chip, tplCat === cat ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted")}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {tplList.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">검색 결과가 없어요.</p>
              ) : (
                tplList.map((t) => {
                  const [tName, tFormula] = splitLabel(t.label)
                  return (
                    <button key={t.id} onClick={() => pickTemplate(t.id)} className={cn("rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:bg-muted", templateAst === t.ast && "border-primary bg-muted")}>
                      <span className="flex items-center gap-1.5">
                        <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">{flowLabel(t.flow)}</span>
                        <span className="text-xs font-medium">{tName}</span>
                      </span>
                      {tFormula && <span className="mt-0.5 block text-[11px] text-muted-foreground">{tFormula}</span>}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* ── 직접 만들기: 이름·구분 + 패턴 칩 ── */}
        {mode === "custom" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                유형 이름
                <input value={name} onChange={(e) => setName(e.target.value)} className={cn(fieldClass)} placeholder="예: 우리 회사 매출" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                구분
                <select value={flow} onChange={(e) => setFlow(e.target.value as typeof flow)} className={cn(fieldClass)}>
                  <option value="revenue">매출</option>
                  <option value="expense">비용</option>
                  <option value="reserve">보유금</option>
                </select>
              </label>
            </div>
            {!isEdit && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">계산 방식 — 고르면 칸만 채우면 돼요</span>
                <div className="flex flex-wrap gap-1.5">
                  {BUILDER_PATTERNS.map((p) => (
                    <button key={p.id} onClick={() => pickPattern(p)} title={p.formula} className={cn(chip, patternId === p.id ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted")}>
                      {p.label}
                    </button>
                  ))}
                  <button onClick={pickAdvanced} className={cn(chip, patternId === "custom" ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted")}>
                    직접 만들기(고급)
                  </button>
                </div>
                {isPattern && <p className="text-[11px] text-muted-foreground">수식: {BUILDER_PATTERNS.find((p) => p.id === patternId)?.formula}</p>}
              </div>
            )}
          </>
        )}

        {/* ── 상세: 이름·구분(템플릿) + 칸 + (고급)스텝 + 미리보기 ── */}
        {showDetail && (
          <>
            {mode === "template" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  유형 이름
                  <input value={name} onChange={(e) => setName(e.target.value)} className={cn(fieldClass)} placeholder="예: 우리 회사 매출" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  구분
                  <select value={flow} onChange={(e) => setFlow(e.target.value as typeof flow)} className={cn(fieldClass)}>
                    <option value="revenue">매출</option>
                    <option value="expense">비용</option>
                    <option value="reserve">보유금</option>
                  </select>
                </label>
              </div>
            )}

            {/* 칸(필드) */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{isPattern ? "칸 이름 (값은 표에서 입력)" : "입력 칸"}</span>
                {isAdvanced && (
                  <button onClick={addField} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted">
                    <Plus className="size-3" /> 칸
                  </button>
                )}
              </div>
              {fields.map((fld) => (
                <div key={fld.key} className="flex items-center gap-2">
                  <input value={fld.label} onChange={(e) => updField(fld.key, { label: e.target.value })} className={cn(fieldClass, "flex-1")} />
                  {mode === "template" ? (
                    <span className="w-12 shrink-0 text-center text-xs text-muted-foreground">{fld.kind === "percent" ? "%" : "숫자"}</span>
                  ) : (
                    <>
                      <select value={fld.kind} onChange={(e) => updField(fld.key, { kind: e.target.value as "number" | "percent" })} className={selCls}>
                        <option value="number">숫자</option>
                        <option value="percent">%</option>
                      </select>
                      {isAdvanced && (
                        <button onClick={() => delField(fld.key)} className="text-muted-foreground hover:text-destructive" aria-label="칸 삭제">
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* 고급: 수식 스텝 */}
            {isAdvanced && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">수식 스텝 (마지막 스텝 = 최종 금액)</span>
                  <button onClick={addStep} disabled={fields.length === 0} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40">
                    <Plus className="size-3" /> 스텝
                  </button>
                </div>
                {steps.map((st, i) => (
                  <div key={st.id} className="flex flex-wrap items-center gap-1 rounded-lg border px-2 py-1 text-xs">
                    <input value={st.name} onChange={(e) => updStep(st.id, { name: e.target.value })} className={cn(fieldClass, "w-20")} placeholder="이름" />
                    <span>=</span>
                    <OperandPicker value={st.left} onChange={(o) => updStep(st.id, { left: o })} fields={fields} priorSteps={steps.slice(0, i)} cls={selCls} />
                    <select value={st.op} onChange={(e) => updStep(st.id, { op: e.target.value as Step["op"] })} className={selCls}>
                      <option value="*">×</option>
                      <option value="-">−</option>
                      <option value="+">+</option>
                      <option value="/">÷</option>
                    </select>
                    <OperandPicker value={st.right} onChange={(o) => updStep(st.id, { right: o })} fields={fields} priorSteps={steps.slice(0, i)} cls={selCls} />
                    <button onClick={() => delStep(st.id)} className="ml-auto text-muted-foreground hover:text-destructive" aria-label="스텝 삭제">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 미리보기 */}
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <p className="text-muted-foreground">
                수식: <span className="font-medium text-foreground">{preview || "—"}</span>
              </p>
              <p className="mt-0.5 text-muted-foreground">
                예시(각 100·%는 10%): <span className="font-semibold tabular-nums text-foreground">{money(sample, "KRW")}</span>
              </p>
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={save} disabled={busy || !ready}>
                {busy && <Loader2 className="size-3.5 animate-spin" />} {isEdit ? "수정" : "추가"}
              </Button>
            </div>
          </>
        )}

        {/* 기존 유형 */}
        {types.length > 0 && (
          <div className="flex flex-col gap-1 border-t pt-2">
            <span className="text-xs text-muted-foreground">내 계산 유형</span>
            {types.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs">
                <span>
                  <span className="mr-1 rounded bg-muted px-1 py-0.5">{flowLabel(t.flow)}</span>
                  {t.name}
                </span>
                <button onClick={() => del(t.id)} className="text-muted-foreground hover:text-destructive" aria-label="삭제">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function OperandPicker({ value, onChange, fields, priorSteps, cls }: { value: Operand; onChange: (o: Operand) => void; fields: CalcField[]; priorSteps: Step[]; cls: string }) {
  const encode = (o: Operand) => (o.t === "field" ? `f:${o.key}` : o.t === "oneMinus" ? `m:${o.key}` : o.t === "step" ? `s:${o.id}` : "n")
  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={encode(value)}
        onChange={(e) => {
          const v = e.target.value
          if (v === "n") onChange({ t: "num", v: 0 })
          else if (v.startsWith("f:")) onChange({ t: "field", key: v.slice(2) })
          else if (v.startsWith("m:")) onChange({ t: "oneMinus", key: v.slice(2) })
          else onChange({ t: "step", id: v.slice(2) })
        }}
        className={cls}
      >
        <optgroup label="칸">
          {fields.map((f) => (
            <option key={f.key} value={`f:${f.key}`}>{f.label}</option>
          ))}
        </optgroup>
        <optgroup label="(1−칸)">
          {fields.map((f) => (
            <option key={f.key} value={`m:${f.key}`}>(1−{f.label})</option>
          ))}
        </optgroup>
        {priorSteps.length > 0 && (
          <optgroup label="이전 스텝">
            {priorSteps.map((s) => (
              <option key={s.id} value={`s:${s.id}`}>{s.name || "스텝"}</option>
            ))}
          </optgroup>
        )}
        <option value="n">숫자…</option>
      </select>
      {value.t === "num" && (
        <input
          value={value.v || ""}
          inputMode="decimal"
          onChange={(e) => onChange({ t: "num", v: Number(e.target.value) || 0 })}
          className="w-14 rounded border bg-background px-1 py-0.5 text-right text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring"
          placeholder="0"
        />
      )}
    </span>
  )
}
