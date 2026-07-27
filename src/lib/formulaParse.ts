// 수식 텍스트 파서 — "판매수 × (단가 × (1−수수료%) − 택배비)" 같은 한 줄을 CalcNode AST로.
// 대표 결정(2026-07-27): 계산 유형 직접 만들기 = AI 없이 "그냥 타이핑"(토큰 비용 0·결정적).
// 핵심 단순화: 칸(필드)을 미리 만들지 않는다 — 수식에 등장한 이름이 곧 입력 칸. 이름 뒤 %는 % 칸.
// 순수 함수(사이드이펙트 0). formulaToText와 왕복 가능(astToEditableText).
import type { CalcNode, CalcField } from "./calcFormula"

export type ParseOk = { ok: true; ast: CalcNode; fields: CalcField[] }
export type ParseErr = { ok: false; error: string }
export type ParseResult = ParseOk | ParseErr

type Tok =
  | { t: "num"; v: number }
  | { t: "field"; label: string; percent: boolean }
  | { t: "op"; op: "+" | "-" | "*" | "/" }
  | { t: "lparen" }
  | { t: "rparen" }

const OP_MAP: Record<string, "+" | "-" | "*" | "/"> = {
  "+": "+", "-": "-", "−": "-", "–": "-", "*": "*", "×": "*", "/": "/", "÷": "/",
}
const isOpChar = (c: string) => c in OP_MAP
const isParen = (c: string) => c === "(" || c === ")"
const isSpace = (c: string) => /\s/.test(c)
const isDigit = (c: string) => c >= "0" && c <= "9"

/** 토크나이즈. knownLabels(기존 칸 이름)는 공백·괄호 포함이어도 최장일치로 한 토큰 처리(편집 왕복용). */
function tokenize(text: string, knownLabels: string[]): Tok[] | ParseErr {
  const toks: Tok[] = []
  const known = [...knownLabels].sort((a, b) => b.length - a.length)
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (isSpace(c)) {
      i++
      continue
    }
    // 기존 칸 이름 최장일치("개당 가격"·"기간(년)" 등 공백/특수문자 포함 대응)
    const hit = known.find((k) => k.length > 0 && text.startsWith(k, i))
    if (hit) {
      i += hit.length
      // 이름 뒤 % 는 %칸 표시(기존 칸이면 원래 kind를 쓰므로 소비만)
      if (text[i] === "%") i++
      toks.push({ t: "field", label: hit, percent: false })
      continue
    }
    if (isOpChar(c)) {
      toks.push({ t: "op", op: OP_MAP[c] })
      i++
      continue
    }
    if (isParen(c)) {
      toks.push(c === "(" ? { t: "lparen" } : { t: "rparen" })
      i++
      continue
    }
    if (isDigit(c) || (c === "." && isDigit(text[i + 1] ?? ""))) {
      let j = i
      while (j < text.length && (isDigit(text[j]) || text[j] === "," || text[j] === ".")) j++
      const raw = text.slice(i, j).replace(/,/g, "")
      const v = Number(raw)
      if (!Number.isFinite(v)) return { ok: false, error: `숫자를 읽을 수 없어요: 『${text.slice(i, j)}』` }
      i = j
      if (text[i] === "%") {
        i++
        toks.push({ t: "num", v: v / 100 }) // 10.8% → 0.108
      } else {
        toks.push({ t: "num", v })
      }
      continue
    }
    if (c === "%") return { ok: false, error: "『%』는 숫자나 칸 이름 바로 뒤에 붙여주세요. (예: 10.8% 또는 수수료%)" }
    // 새 칸 이름 — 연산자·괄호·공백·%가 나올 때까지
    let j = i
    while (j < text.length && !isSpace(text[j]) && !isOpChar(text[j]) && !isParen(text[j]) && text[j] !== "%") j++
    const label = text.slice(i, j)
    i = j
    let percent = false
    if (text[i] === "%") {
      percent = true
      i++
    }
    toks.push({ t: "field", label, percent })
  }
  return toks
}

/** 수식 텍스트 → AST + 칸 목록. known 칸은 key·kind 유지, 새 이름은 자동 생성(등장 순 c1..). */
export function parseFormulaText(text: string, known: CalcField[] = []): ParseResult {
  if (!text.trim()) return { ok: false, error: "수식을 입력해 주세요. (예: 판매수 × 단가 − 택배비)" }
  const toked = tokenize(text, known.map((f) => f.label))
  if (!Array.isArray(toked)) return toked
  const toks = toked

  // 칸 등록 — known 라벨은 그대로, 새 라벨은 순서대로 키 부여(%표시가 한 번이라도 있으면 % 칸)
  const fields: CalcField[] = []
  const byLabel = new Map<string, CalcField>()
  for (const f of known) byLabel.set(f.label, f)
  const usedKeys = new Set(known.map((f) => f.key))
  let seq = 1
  const fieldFor = (label: string, percent: boolean): CalcField | ParseErr => {
    if (!label) return { ok: false, error: "칸 이름이 비었어요." }
    const exist = byLabel.get(label)
    if (exist) {
      if (!fields.includes(exist)) fields.push(exist)
      return exist
    }
    let key = `c${seq++}`
    while (usedKeys.has(key)) key = `c${seq++}`
    usedKeys.add(key)
    const f: CalcField = { key, label, kind: percent ? "percent" : "number" }
    byLabel.set(label, f)
    fields.push(f)
    return f
  }

  // 재귀 하강 — expr = term ((+|−) term)* / term = factor ((×|÷) factor)* / factor = num | field | (expr)
  let pos = 0
  const peek = () => toks[pos]
  const errAt = (msg: string): ParseErr => ({ ok: false, error: msg })
  const tokLabel = (tk: Tok | undefined): string =>
    !tk ? "수식 끝" : tk.t === "num" ? String(tk.v) : tk.t === "field" ? tk.label : tk.t === "op" ? { "+": "+", "-": "−", "*": "×", "/": "÷" }[tk.op] : tk.t === "lparen" ? "(" : ")"

  function parseFactor(): CalcNode | ParseErr {
    const tk = peek()
    if (!tk) return errAt("수식이 중간에 끝났어요 — 숫자나 칸 이름이 더 필요해요.")
    if (tk.t === "num") {
      pos++
      return { t: "const", v: tk.v }
    }
    if (tk.t === "field") {
      pos++
      const f = fieldFor(tk.label, tk.percent)
      if ("ok" in f) return f
      return { t: "field", key: f.key }
    }
    if (tk.t === "lparen") {
      pos++
      const inner = parseExpr()
      if ("ok" in inner) return inner
      const close = peek()
      if (!close || close.t !== "rparen") return errAt("괄호가 닫히지 않았어요 — ')'를 추가해 주세요.")
      pos++
      return inner
    }
    return errAt(`『${tokLabel(tk)}』 자리에는 숫자나 칸 이름이 와야 해요.`)
  }
  function parseTerm(): CalcNode | ParseErr {
    let left = parseFactor()
    if ("ok" in left) return left
    for (;;) {
      const tk = peek()
      if (!tk || tk.t !== "op" || (tk.op !== "*" && tk.op !== "/")) return left
      pos++
      const right = parseFactor()
      if ("ok" in right) return right
      left = { t: "op", op: tk.op, a: left, b: right }
    }
  }
  function parseExpr(): CalcNode | ParseErr {
    let left = parseTerm()
    if ("ok" in left) return left
    for (;;) {
      const tk = peek()
      if (!tk || tk.t !== "op" || (tk.op !== "+" && tk.op !== "-")) return left
      pos++
      const right = parseTerm()
      if ("ok" in right) return right
      left = { t: "op", op: tk.op, a: left, b: right }
    }
  }

  const ast = parseExpr()
  if ("ok" in ast) return ast
  const rest = peek()
  if (rest) return { ok: false, error: `『${tokLabel(rest)}』 앞에 +, −, ×, ÷ 중 하나가 필요해요.` }
  return { ok: true, ast, fields }
}

/** AST → 편집용 수식 텍스트 — formulaToText와 같되 % 칸 이름에 %를 붙여 왕복 시 kind가 보존되게. */
export function astToEditableText(ast: CalcNode, fields: CalcField[]): string {
  const label = (key: string) => {
    const f = fields.find((x) => x.key === key)
    if (!f) return key
    return f.kind === "percent" && !f.label.endsWith("%") ? `${f.label}%` : f.label
  }
  const walk = (n: CalcNode): string => {
    if (n.t === "const") return String(Number(n.v.toPrecision(12))) // 부동소수점 노이즈 제거(0.108…001 → 0.108)
    if (n.t === "field") return label(n.key)
    const sym = n.op === "*" ? "×" : n.op === "/" ? "÷" : n.op === "-" ? "−" : "+"
    return `(${walk(n.a)} ${sym} ${walk(n.b)})`
  }
  const s = walk(ast)
  return s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s
}
