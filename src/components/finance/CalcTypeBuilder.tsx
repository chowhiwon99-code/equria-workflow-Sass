"use client"

import { useMemo, useState } from "react"
import { X, Trash2, Loader2, Search, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { fieldClass } from "@/components/shared/Modal"
import { Button } from "@/components/ui/button"
import { CALC_TEMPLATES, BUILDER_PATTERNS, TEMPLATE_CATEGORIES, templateCategory, evalFormula, type CalcField, type CalcNode } from "@/lib/calcFormula"
import { parseFormulaText, astToEditableText } from "@/lib/formulaParse"
import { money } from "@/lib/finance"
import type { CashCalcType } from "@/types"

const flowLabel = (flow: string) => (flow === "revenue" ? "매출" : flow === "reserve" ? "보유금" : "비용")
// 템플릿 라벨 "이름 — 수식" 분리(표시용).
const splitLabel = (label: string): [string, string] => {
  const i = label.indexOf(" — ")
  return i >= 0 ? [label.slice(0, i), label.slice(i + 3)] : [label, ""]
}

/** 실값 라이브 미리보기 — 각 칸에 진짜 숫자를 넣어보고 결과를 바로 확인(가짜 예시값 대체). */
function LivePreview({ ast, fields, vals, onChange }: { ast: CalcNode; fields: CalcField[]; vals: Record<string, string>; onChange: (key: string, v: string) => void }) {
  const nums: Record<string, number> = {}
  for (const f of fields) {
    const n = Number((vals[f.key] ?? "").replace(/,/g, ""))
    nums[f.key] = Number.isFinite(n) ? (f.kind === "percent" ? n / 100 : n) : 0
  }
  const result = evalFormula(ast, nums)
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2.5">
      <span className="text-[11px] font-medium text-muted-foreground">실제 숫자를 넣어 확인해 보세요</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {fields.map((f) => (
          <label key={f.key} className="flex items-center gap-1 text-xs text-muted-foreground">
            {f.label}
            <span className="relative">
              <input
                inputMode="decimal"
                value={vals[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                placeholder="0"
                className={cn("h-7 rounded border bg-background px-1.5 text-right text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring", f.kind === "percent" ? "w-16 pr-5" : "w-24")}
              />
              {f.kind === "percent" && <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>}
            </span>
          </label>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          = <b className="text-sm font-semibold tabular-nums text-foreground">{money(result, "KRW")}</b>
        </span>
      </div>
    </div>
  )
}

/**
 * 회사가 계산 유형(칸+수식)을 직접 정의.
 * ① 템플릿에서 시작(업종 카테고리·검색) ② 직접 만들기 — 수식을 "그냥 타이핑"(대표 결정 2026-07-27):
 *    수식에 쓴 이름이 곧 입력 칸(따로 안 만듦), 이름 뒤 %면 % 칸. 실값 미리보기로 확인 후 저장.
 *    (구 스텝 조립 UI 제거 — 파서는 lib/formulaParse, AI·토큰 비용 0)
 */
export function CalcTypeBuilder({ types, editType, onClose, onSaved }: { types: CashCalcType[]; editType?: CashCalcType | null; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const me = useCurrentUserId()
  const wsId = useCurrentWorkspaceId() // B1-b: 쓰기에 워크스페이스 명시
  const isEdit = !!editType
  const editAst = (editType?.formula as { ast?: CalcNode } | null)?.ast ?? null
  const editFields = useMemo(() => ((editType?.fields as unknown as CalcField[]) ?? []), [editType])

  const [mode, setMode] = useState<"template" | "custom">(editType ? "custom" : "template")
  const [name, setName] = useState(editType?.name ?? "")
  const [flow, setFlow] = useState<"revenue" | "expense" | "reserve">((editType?.flow as "revenue" | "expense" | "reserve") ?? "expense")
  const [busy, setBusy] = useState(false)
  // 템플릿 모드 전용(선택한 템플릿의 칸 이름을 고쳐 쓰는 기존 UX 유지)
  const [fields, setFields] = useState<CalcField[]>([])
  const [templateAst, setTemplateAst] = useState<CalcNode | null>(null)
  const [tplCat, setTplCat] = useState<string>("전체")
  const [tplQuery, setTplQuery] = useState("")
  // 직접 만들기/편집 — 수식 텍스트가 유일한 입력(칸은 파서가 자동 인식)
  const [formulaText, setFormulaText] = useState(() => (isEdit && editAst ? astToEditableText(editAst, editFields) : ""))
  const [sampleVals, setSampleVals] = useState<Record<string, string>>(() =>
    // 편집 진입 시 기본값(def) 칸은 미리 채워 보여준다(템플릿 pick과 동일 동작)
    Object.fromEntries(
      editFields.filter((x) => x.def != null).map((x) => [x.key, String(x.kind === "percent" ? +((x.def as number) * 100).toFixed(2) : (x.def as number))])
    )
  )

  // 텍스트 → AST+칸 (편집 모드는 기존 칸의 key·kind 보존)
  const parsed = useMemo(() => parseFormulaText(formulaText, isEdit ? editFields : []), [formulaText, isEdit, editFields])
  // 문장 감지 — 암묵 곱셈 때문에 "제품을 여러개로 곱해줘" 같은 문장이 엉터리 수식으로 '성공'해버려
  // AI 버튼이 안 뜨던 문제 방지: 동사/조사 단서가 있거나, 연산자·숫자 없이 단어만 나열이면 문장으로 본다.
  const looksLikeSentence = useMemo(() => {
    const t = formulaText.trim()
    if (!t) return false
    const HINTS = ["곱해", "곱하", "더해", "더하", "나눠", "나누", "빼줘", "빼주", "떼", "얹", "해줘", "해주", "주세요", "퍼센트", "프로", "합쳐", "합해", "값을", "금액을"]
    if (HINTS.some((w) => t.includes(w))) return true
    const hasFormulaSignal = /[+\-−–*×/÷%()]/.test(t) || /\d/.test(t)
    return !hasFormulaSignal && parsed.ok && parsed.fields.length >= 2
  }, [formulaText, parsed])
  // 자연어 → 수식 AI 폴백 — 결과는 다시 파서가 검증
  const [aiBusy, setAiBusy] = useState(false)
  const aiConvert = async () => {
    setAiBusy(true)
    try {
      const res = await fetch("/api/finance/formula", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: formulaText }),
      })
      const j = (await res.json().catch(() => ({}))) as { formula?: string; error?: string }
      if (!res.ok || !j.formula) throw new Error(j.error ?? "변환에 실패했어요.")
      setFormulaText(j.formula)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "변환에 실패했어요.")
    } finally {
      setAiBusy(false)
    }
  }
  const customOk = parsed.ok && parsed.fields.length > 0

  const ast = mode === "template" ? templateAst : parsed.ok ? parsed.ast : null
  const activeFields = mode === "template" ? fields : parsed.ok ? parsed.fields : []
  const ready = mode === "template" ? templateAst != null && fields.length > 0 : customOk

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
    // 기본값(법정 요율 등)은 미리보기에 바로 채워 보여준다 — "자동 적용"이 눈에 보이게.
    setSampleVals(Object.fromEntries(t.fields.filter((x) => x.def != null).map((x) => [x.key, String(x.kind === "percent" ? +((x.def as number) * 100).toFixed(2) : (x.def as number))])))
  }
  const updField = (key: string, patch: Partial<CalcField>) => setFields((fs) => fs.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  const switchMode = (m: "template" | "custom") => {
    setMode(m)
    setFields([])
    setTemplateAst(null)
    setFormulaText("")
    setSampleVals({})
  }

  const save = async () => {
    if (!me) return
    if (!name.trim()) return toast.error("유형 이름을 입력해 주세요.")
    if (!ready || !ast) {
      return toast.error(mode === "template" ? "템플릿을 선택해 주세요." : parsed.ok ? "칸(이름)이 하나는 있어야 해요 — 숫자만으로는 유형이 안 돼요." : "수식을 완성해 주세요.")
    }
    setBusy(true)
    try {
      if (isEdit && editType) {
        await mustOk(supabase.from("cash_calc_types").update({ name: name.trim(), flow, fields: activeFields, formula: { ast } }).eq("id", editType.id))
        toast.success("계산 칸을 수정했어요.")
        onSaved()
        onClose()
        return
      }
      await mustOk(supabase.from("cash_calc_types").insert({ ...(wsId ? { workspace_id: wsId } : {}), name: name.trim(), flow, fields: activeFields, formula: { ast }, created_by: me, sort_order: types.length }))
      toast.success("계산 유형을 추가했어요.")
      setName("")
      setTemplateAst(null)
      setFields([])
      setFormulaText("")
      setSampleVals({})
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

  const chip = "rounded-full border px-2.5 py-1 text-xs transition-colors"
  const showDetail = mode === "template" ? !!templateAst : true

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

        {/* ── 템플릿에서 시작: 검색 + 카테고리 + 목록 ── */}
        {mode === "template" && !isEdit && (
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

        {showDetail && (
          <>
            {/* 이름·구분 */}
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

            {/* ── 직접 만들기/편집: 수식 타이핑이 전부 ── */}
            {mode === "custom" && (
              <div className="flex flex-col gap-2">
                {/* 빠른 시작 — 누르면 수식이 채워지고, 이름만 우리 회사 말로 고치면 됨 */}
                {!isEdit && (
                  <div className="flex flex-wrap gap-1.5">
                    {BUILDER_PATTERNS.map((p) => (
                      <button key={p.id} onClick={() => setFormulaText(p.formula)} className={cn(chip, "text-muted-foreground hover:bg-muted")} title={p.formula}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  수식 — 그냥 적으면 돼요 (말로 써도 AI가 바꿔줘요)
                  <div className="flex gap-1.5">
                    <input
                      value={formulaText}
                      onChange={(e) => setFormulaText(e.target.value)}
                      className={cn(fieldClass, "h-10 flex-1 text-[15px]")}
                      placeholder="예: 판매수 × (단가 × (1 − 수수료%) − 택배비)"
                      autoFocus={!isEdit}
                    />
                    {/* 상시 노출(대표 결정) — 누를 때만 비용 발생(Haiku 원샷), 결과는 파서가 재검증 */}
                    <Button size="sm" variant="outline" className="h-10 shrink-0" onClick={aiConvert} disabled={aiBusy || !formulaText.trim()}>
                      {aiBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} AI로 바꾸기
                    </Button>
                  </div>
                </label>
                <p className="text-[11px] text-muted-foreground">
                  수식에 쓴 이름이 그대로 입력 칸이 돼요 · % 칸은 이름 뒤에 <b className="text-foreground">%</b>(예: 수수료%) · 기호는 + − × ÷ ( ) 그리고 *, / 도 돼요
                </p>

                {formulaText.trim() &&
                  (parsed.ok ? (
                    <div className="flex flex-col gap-1">
                      {/* 문장 같으면 — 해석이 엉터리일 수 있으니 상시 버튼으로 안내 */}
                      {looksLikeSentence && (
                        <p className="text-[11px] text-warning">문장처럼 보여요 — 아래 해석이 이상하면 위 ‘AI로 바꾸기’를 눌러주세요.</p>
                      )}
                      {/* 해석 — 암묵 곱셈("급여 3.3%"→급여 × 3.3%) 등 파서가 이해한 결과를 투명하게 */}
                      <p className="text-[11px] text-muted-foreground">
                        해석: <span className="font-medium text-foreground">{astToEditableText(parsed.ast, parsed.fields)}</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">인식된 칸</span>
                        {parsed.fields.map((f) => (
                          <span key={f.key} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                            {f.label}
                            {f.kind === "percent" && <span className="ml-0.5 text-muted-foreground">%</span>}
                          </span>
                        ))}
                        {parsed.fields.length === 0 && <span className="text-[11px] text-warning">숫자만 있어요 — 칸(이름)을 하나 이상 넣어주세요.</span>}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-destructive">{parsed.error} <span className="text-muted-foreground">— 또는 위 ‘AI로 바꾸기’로 변환해보세요.</span></p>
                  ))}
              </div>
            )}

            {/* 템플릿 모드: 칸 이름 커스터마이즈(값은 표에서 입력) */}
            {mode === "template" && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">칸 이름 (값은 표에서 입력)</span>
                {fields.map((fld) => (
                  <div key={fld.key} className="flex items-center gap-2">
                    <input value={fld.label} onChange={(e) => updField(fld.key, { label: e.target.value })} className={cn(fieldClass, "flex-1")} />
                    <span className="w-12 shrink-0 text-center text-xs text-muted-foreground">{fld.kind === "percent" ? "%" : "숫자"}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 실값 라이브 미리보기 — 두 모드 공통 */}
            {ast && activeFields.length > 0 && (
              <LivePreview ast={ast} fields={activeFields} vals={sampleVals} onChange={(k, v) => setSampleVals((p) => ({ ...p, [k]: v }))} />
            )}

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
