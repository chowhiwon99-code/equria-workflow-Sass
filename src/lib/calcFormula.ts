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
    { key: "units", label: "개수", kind: "number" },
    { key: "unit_price", label: "개당 가격", kind: "number" },
    { key: "extra", label: "추가금", kind: "number" },
  ],
  channel: [
    { key: "units", label: "개수", kind: "number" },
    { key: "unit_price", label: "개당 가격", kind: "number" },
    { key: "rate", label: "수수료", kind: "percent" },
    { key: "extra", label: "배송비", kind: "number" },
  ],
}
// qty: 갯수 × 단가 + 정액
export const QTY_AST: CalcNode = op("+", op("*", f("units"), f("unit_price")), f("extra"))
// channel: 판매수 × (단가 × (1 − 수수료) − 택배비)
export const CHANNEL_AST: CalcNode = op("*", f("units"), op("-", op("*", f("unit_price"), op("-", c(1), f("rate"))), f("extra")))

// ── 빌더용 한국어 템플릿(시드) ──
export type CalcTemplate = { id: string; label: string; flow: "revenue" | "expense" | "reserve"; fields: CalcField[]; ast: CalcNode }
export const CALC_TEMPLATES: CalcTemplate[] = [
  // 이커머스/판매
  { id: "channel", label: "채널 매출 — 판매수 × (단가 × (1−수수료%) − 택배비)", flow: "revenue", fields: BUILTIN_FIELDS.channel, ast: CHANNEL_AST },
  { id: "ecom_settle", label: "이커머스 정산 — 판매가 × (1−수수료%) × 수량", flow: "revenue", fields: [{ key: "price", label: "판매가", kind: "number" }, { key: "fee", label: "마켓수수료", kind: "percent" }, { key: "qty", label: "판매수량", kind: "number" }], ast: op("*", op("*", f("price"), op("-", c(1), f("fee"))), f("qty")) },
  { id: "ecom_var", label: "이커머스 변동비 — (수량×매입원가)+(수량×배송비)", flow: "expense", fields: [{ key: "qty", label: "판매수량", kind: "number" }, { key: "cost", label: "매입원가", kind: "number" }, { key: "ship", label: "건당배송비", kind: "number" }], ast: op("+", op("*", f("qty"), f("cost")), op("*", f("qty"), f("ship"))) },
  { id: "margin", label: "도소매 마진 — (판매가−원가) × 수량", flow: "revenue", fields: [{ key: "price", label: "판매가", kind: "number" }, { key: "cost", label: "매입원가", kind: "number" }, { key: "qty", label: "판매수량", kind: "number" }], ast: op("*", op("-", f("price"), f("cost")), f("qty")) },
  { id: "discount", label: "할인/묶음 — 정가 × (1−할인율) × 수량", flow: "revenue", fields: [{ key: "list", label: "정가", kind: "number" }, { key: "disc", label: "할인율", kind: "percent" }, { key: "qty", label: "수량", kind: "number" }], ast: op("*", op("*", f("list"), op("-", c(1), f("disc"))), f("qty")) },
  // 비용 일반
  { id: "qty", label: "수량 비용 — 갯수 × 단가 (+ 정액)", flow: "expense", fields: BUILTIN_FIELDS.qty, ast: QTY_AST },
  { id: "labor", label: "인건비 — 시급 × 시간 × 인원", flow: "expense", fields: [{ key: "wage", label: "시급", kind: "number" }, { key: "hours", label: "근무시간", kind: "number" }, { key: "people", label: "인원", kind: "number" }], ast: op("*", op("*", f("wage"), f("hours")), f("people")) },
  { id: "labor_ins", label: "인건비(4대보험) — 급여 × (1+보험요율)", flow: "expense", fields: [{ key: "salary", label: "월급여", kind: "number" }, { key: "ins", label: "사업주부담요율", kind: "percent" }], ast: op("*", f("salary"), op("+", c(1), f("ins"))) },
  { id: "rent", label: "임대료 — 평수 × 평당임대료", flow: "expense", fields: [{ key: "area", label: "면적(평)", kind: "number" }, { key: "perPy", label: "평당임대료", kind: "number" }], ast: op("*", f("area"), f("perPy")) },
  // F&B
  { id: "guest", label: "객단가 매출 — 객단가 × 방문수", flow: "revenue", fields: [{ key: "per", label: "객단가", kind: "number" }, { key: "visits", label: "방문객수", kind: "number" }], ast: op("*", f("per"), f("visits")) },
  { id: "food_cost", label: "식재료비 — 매출 × 원가율", flow: "expense", fields: [{ key: "sales", label: "매출액", kind: "number" }, { key: "rate", label: "식재료원가율", kind: "percent" }], ast: op("*", f("sales"), f("rate")) },
  // 제조/화장품
  { id: "mfg_mat", label: "제조 재료비 — 원자재단가 × 소요량 × 생산수량", flow: "expense", fields: [{ key: "mat", label: "원자재단가", kind: "number" }, { key: "use", label: "단위소요량", kind: "number" }, { key: "qty", label: "생산수량", kind: "number" }], ast: op("*", op("*", f("mat"), f("use")), f("qty")) },
  { id: "mfg_yield", label: "제조 양품 매출 — 생산수량 × (1−불량률) × 단가", flow: "revenue", fields: [{ key: "qty", label: "생산수량", kind: "number" }, { key: "defect", label: "불량률", kind: "percent" }, { key: "price", label: "판매단가", kind: "number" }], ast: op("*", op("*", f("qty"), op("-", c(1), f("defect"))), f("price")) },
  { id: "cosmetic", label: "화장품 원가 — (내용물+용기부자재) × 생산수량", flow: "expense", fields: [{ key: "content", label: "내용물단가", kind: "number" }, { key: "pack", label: "용기부자재단가", kind: "number" }, { key: "qty", label: "생산수량", kind: "number" }], ast: op("*", op("+", f("content"), f("pack")), f("qty")) },
  // 마케팅/물류
  { id: "influencer", label: "인플루언서/협찬 — 인당단가 × 인원수", flow: "expense", fields: [{ key: "per", label: "인플루언서단가", kind: "number" }, { key: "n", label: "섭외인원", kind: "number" }], ast: op("*", f("per"), f("n")) },
  { id: "fulfill_out", label: "풀필먼트 출고 — (건수×건당)+(중량×kg단가)", flow: "expense", fields: [{ key: "orders", label: "출고건수", kind: "number" }, { key: "perOrder", label: "건당출고비", kind: "number" }, { key: "weight", label: "총중량kg", kind: "number" }, { key: "perKg", label: "kg당단가", kind: "number" }], ast: op("+", op("*", f("orders"), f("perOrder")), op("*", f("weight"), f("perKg"))) },
  { id: "inbound", label: "입고 검수비 — 박스수 × 박스당단가", flow: "expense", fields: [{ key: "boxes", label: "입고박스수", kind: "number" }, { key: "perBox", label: "박스당검수단가", kind: "number" }], ast: op("*", f("boxes"), f("perBox")) },
  // 서비스/SaaS
  { id: "mm", label: "서비스 용역(MM) — 인월단가 × 투입개월 × 인원", flow: "revenue", fields: [{ key: "mm", label: "인월단가", kind: "number" }, { key: "months", label: "투입개월", kind: "number" }, { key: "people", label: "투입인원", kind: "number" }], ast: op("*", op("*", f("mm"), f("months")), f("people")) },
  { id: "project", label: "프로젝트 정액 — 단가 × 건수", flow: "revenue", fields: [{ key: "rate", label: "프로젝트단가", kind: "number" }, { key: "n", label: "프로젝트수", kind: "number" }], ast: op("*", f("rate"), f("n")) },
  { id: "saas_mrr", label: "SaaS 구독 — 구독자 × 월요금 × (1−이탈률)", flow: "revenue", fields: [{ key: "subs", label: "구독자수", kind: "number" }, { key: "fee", label: "월요금", kind: "number" }, { key: "churn", label: "이탈률", kind: "percent" }], ast: op("*", op("*", f("subs"), f("fee")), op("-", c(1), f("churn"))) },
  { id: "saas_annual", label: "SaaS 연결제 — 월요금 × 12 × (1−연할인율)", flow: "revenue", fields: [{ key: "fee", label: "월요금", kind: "number" }, { key: "yd", label: "연할인율", kind: "percent" }], ast: op("*", op("*", f("fee"), c(12)), op("-", c(1), f("yd"))) },
  // 광고/중개/금융
  { id: "cpc", label: "광고 CPC — CPC × 클릭수", flow: "revenue", fields: [{ key: "cpc", label: "CPC", kind: "number" }, { key: "clicks", label: "클릭수", kind: "number" }], ast: op("*", f("cpc"), f("clicks")) },
  { id: "cpm", label: "광고 CPM — (노출수 ÷ 1000) × CPM", flow: "revenue", fields: [{ key: "imp", label: "노출수", kind: "number" }, { key: "cpm", label: "CPM", kind: "number" }], ast: op("*", op("/", f("imp"), c(1000)), f("cpm")) },
  { id: "ad_fee", label: "광고대행 수수료 — 매체비 × 수수료율", flow: "revenue", fields: [{ key: "media", label: "매체집행비", kind: "number" }, { key: "rate", label: "대행수수료율", kind: "percent" }], ast: op("*", f("media"), f("rate")) },
  { id: "take_rate", label: "중개 수수료(GMV) — 거래액 × 수수료율", flow: "revenue", fields: [{ key: "gmv", label: "거래액", kind: "number" }, { key: "rate", label: "수수료율", kind: "percent" }], ast: op("*", f("gmv"), f("rate")) },
  { id: "per_tx", label: "중개 건당 — 거래건수 × 건당수수료", flow: "revenue", fields: [{ key: "n", label: "거래건수", kind: "number" }, { key: "per", label: "건당수수료", kind: "number" }], ast: op("*", f("n"), f("per")) },
  { id: "interest", label: "이자(단리) — 원금 × 이율 × 기간", flow: "revenue", fields: [{ key: "p", label: "원금", kind: "number" }, { key: "r", label: "연이율", kind: "percent" }, { key: "y", label: "기간(년)", kind: "number" }], ast: op("*", op("*", f("p"), f("r")), f("y")) },
]

/** 계산 유형의 flow → cash_accounts.kind(롤업용). */
export function flowToKind(flow: string): string {
  return flow === "revenue" ? "revenue_src" : flow === "reserve" ? "reserve" : "expense_dst"
}

/** 사람이 읽는 수식 문자열(미리보기용). */
export function formulaToText(ast: CalcNode, fields: CalcField[]): string {
  const label = (key: string) => fields.find((x) => x.key === key)?.label || key
  const walk = (n: CalcNode): string => {
    if (n.t === "const") return String(n.v)
    if (n.t === "field") return label(n.key)
    const sym = n.op === "*" ? "×" : n.op === "/" ? "÷" : n.op
    return `(${walk(n.a)} ${sym} ${walk(n.b)})`
  }
  const s = walk(ast)
  return s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s
}
