// 사용자 정의 계산 — 하나의 AST에서 앱 계산(JS)과 엑셀 수식 문자열을 동시 생성 → 앱·엑셀이 절대 어긋나지 않음.

export type CalcField = { key: string; label: string; kind: "number" | "percent" }

export type CalcNode =
  | { t: "field"; key: string }
  | { t: "const"; v: number }
  | { t: "op"; op: "+" | "-" | "*" | "/"; a: CalcNode; b: CalcNode }

export type CalcFormula = { ast: CalcNode }

function isNode(x: unknown): x is CalcNode {
  return !!x && typeof x === "object" && "t" in (x as Record<string, unknown>)
}

/** AST → 숫자(앱 계산). values = { fieldKey: number }. */
export function evalFormula(ast: CalcNode | null | undefined, values: Record<string, number>): number {
  if (!isNode(ast)) return 0
  const walk = (n: CalcNode): number => {
    if (n.t === "const") return n.v
    if (n.t === "field") return Number(values[n.key] ?? 0)
    const a = walk(n.a)
    const b = walk(n.b)
    if (n.op === "+") return a + b
    if (n.op === "-") return a - b
    if (n.op === "*") return a * b
    return b === 0 ? 0 : a / b // ÷0 가드(엑셀은 IFERROR로 미러)
  }
  return walk(ast)
}

/** AST → 엑셀 수식 문자열. colOf = { fieldKey: 'D' }, row = 행번호. 이항마다 괄호 → 우선순위 보장. */
export function toExcelFormula(ast: CalcNode, colOf: Record<string, string>, row: number): string {
  const walk = (n: CalcNode): string => {
    if (n.t === "const") return String(n.v)
    if (n.t === "field") return `${colOf[n.key] ?? "A"}${row}`
    return `(${walk(n.a)}${n.op}${walk(n.b)})`
  }
  return walk(ast)
}

// ── AST 빌더 헬퍼 ──
const f = (key: string): CalcNode => ({ t: "field", key })
const c = (v: number): CalcNode => ({ t: "const", v })
const op = (o: "+" | "-" | "*" | "/", a: CalcNode, b: CalcNode): CalcNode => ({ t: "op", op: o, a, b })

// ── 빌트인 유형(fixed/qty/channel)의 필드·AST — 레거시 컬럼 키(units/unit_price/rate/extra) 사용 ──
export const BUILTIN_FIELDS: Record<"qty" | "channel", CalcField[]> = {
  qty: [
    { key: "units", label: "갯수", kind: "number" },
    { key: "unit_price", label: "단가", kind: "number" },
    { key: "extra", label: "정액(부가세 등)", kind: "number" },
  ],
  channel: [
    { key: "units", label: "판매수", kind: "number" },
    { key: "unit_price", label: "단가", kind: "number" },
    { key: "rate", label: "수수료", kind: "percent" },
    { key: "extra", label: "택배비", kind: "number" },
  ],
}
// qty: 갯수 × 단가 + 정액
export const QTY_AST: CalcNode = op("+", op("*", f("units"), f("unit_price")), f("extra"))
// channel: 판매수 × (단가 × (1 − 수수료) − 택배비)
export const CHANNEL_AST: CalcNode = op("*", f("units"), op("-", op("*", f("unit_price"), op("-", c(1), f("rate"))), f("extra")))

// ── 빌더용 한국어 템플릿(시드) ──
export type CalcTemplate = { id: string; label: string; flow: "revenue" | "expense" | "reserve"; fields: CalcField[]; ast: CalcNode }
export const CALC_TEMPLATES: CalcTemplate[] = [
  { id: "channel", label: "채널 매출 — 판매수 × (단가 × (1−수수료%) − 택배비)", flow: "revenue", fields: BUILTIN_FIELDS.channel, ast: CHANNEL_AST },
  { id: "qty", label: "수량 비용 — 갯수 × 단가 (+ 정액)", flow: "expense", fields: BUILTIN_FIELDS.qty, ast: QTY_AST },
  {
    id: "subscription",
    label: "구독 — 월요금 × 개월수",
    flow: "expense",
    fields: [
      { key: "monthly", label: "월요금", kind: "number" },
      { key: "months", label: "개월수", kind: "number" },
    ],
    ast: op("*", f("monthly"), f("months")),
  },
  {
    id: "rate_fee",
    label: "정률 수수료 — 금액 × 율",
    flow: "expense",
    fields: [
      { key: "base", label: "금액", kind: "number" },
      { key: "rate", label: "율", kind: "percent" },
    ],
    ast: op("*", f("base"), f("rate")),
  },
]

/** 계산 유형의 flow → cash_accounts.kind(롤업용). */
export function flowToKind(flow: string): string {
  return flow === "revenue" ? "revenue_src" : flow === "reserve" ? "reserve" : "expense_dst"
}

/** 사람이 읽는 수식 문자열(미리보기용). */
export function formulaToText(ast: CalcNode, fields: CalcField[]): string {
  const label = (key: string) => fields.find((x) => x.key === key)?.label ?? key
  const walk = (n: CalcNode): string => {
    if (n.t === "const") return String(n.v)
    if (n.t === "field") return label(n.key)
    const sym = n.op === "*" ? "×" : n.op === "/" ? "÷" : n.op
    return `(${walk(n.a)} ${sym} ${walk(n.b)})`
  }
  const s = walk(ast)
  return s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s
}
