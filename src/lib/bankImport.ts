/**
 * 통장 거래내역 가져오기 — 순수 로직(브라우저·Node 공용, DOM 의존 0).
 *
 * 흐름: 파일 → 2차원 문자열 표(bankFile.ts) → detectHeader(열 자동 감지) → parseRows → BankTxn[]
 *       → (사람이 미리보기에서 분류 확인) → finance_entries(source='bank', import_fp로 중복 차단).
 * ⚠️ BankTxn이 "은행 → 장부"의 단일 이음새다. 나중에 자동 연동(CODEF 등)을 붙일 때도 응답을 BankTxn으로만
 *    바꾸면 미리보기·분류·중복 방지·저장은 그대로 재사용된다.
 * 은행마다 엑셀 양식이 달라 특정 은행 전용 파서를 두지 않고, 머리행 키워드로 열을 찾는다(실패 시 수동 매핑).
 * 회귀 검사: `node --experimental-strip-types scripts/check-bank-import.mts`
 */

export type BankDirection = "in" | "out"

/** 은행 거래 1건(정규화). 금액은 항상 양수, 방향은 direction. */
export type BankTxn = {
  /** YYYY-MM-DD */
  date: string
  /** HH:mm:ss (없으면 null) */
  time: string | null
  direction: BankDirection
  amount: number
  /** 거래 후 잔액(없으면 null) */
  balance: number | null
  /** 상대방·기재내용 — 장부의 거래처(vendor)로 쓴다 */
  description: string
  /** 적요·메모 등 보조 정보 */
  memo: string | null
}

export type ColumnField =
  | "date"
  | "time"
  | "description"
  | "memo"
  | "deposit"
  | "withdraw"
  | "amount"
  | "direction"
  | "balance"

/** 열 번호 매핑(0-base). 없으면 null. */
export type ColumnMap = Record<ColumnField, number | null>

export const COLUMN_LABELS: Record<ColumnField, string> = {
  date: "거래일(시)",
  time: "거래시간",
  description: "내용(거래처)",
  memo: "적요·메모",
  deposit: "입금액",
  withdraw: "출금액",
  amount: "거래금액(부호/구분)",
  direction: "입출금 구분",
  balance: "잔액",
}

export const EMPTY_MAP: ColumnMap = {
  date: null,
  time: null,
  description: null,
  memo: null,
  deposit: null,
  withdraw: null,
  amount: null,
  direction: null,
  balance: null,
}

// 머리행 키워드 — 공백·괄호 단위("(원)")를 지운 뒤 포함 여부로 본다.
// 순서가 중요하다: 앞 필드가 먼저 열을 가져간다("입출금구분"이 입금/출금에 먹히지 않게 direction이 먼저).
const FIELD_KEYWORDS: [ColumnField, string[]][] = [
  ["direction", ["입출금구분", "거래구분", "입출구분", "구분"]],
  ["balance", ["거래후잔액", "잔액", "잔고"]],
  ["deposit", ["입금액", "입금금액", "맡기신금액", "받으신금액", "입금"]],
  ["withdraw", ["출금액", "출금금액", "찾으신금액", "지급액", "지급금액", "출금", "지급"]],
  ["amount", ["거래금액", "금액"]],
  ["date", ["거래일시", "거래일자", "거래일", "일시", "일자", "날짜", "이체일"]],
  ["time", ["거래시간", "시간", "시각"]],
  // 거래처명이 들어가는 열을 우선(기재내용·받는분…), 없으면 적요/내용.
  ["description", ["기재내용", "받는분", "보내는분", "보낸분", "입금자", "의뢰인", "수취인", "거래처", "상대", "통장표시", "거래내용", "내용", "적요"]],
  ["memo", ["적요", "메모", "비고", "거래점", "취급점"]],
]

export function normalizeHeader(s: string): string {
  return s.replace(/\([^)]*\)/g, "").replace(/[\s·_\-/.]/g, "")
}

/** 한 행을 머리행으로 보고 열 매핑을 만든다. */
export function mapHeaderRow(row: string[]): ColumnMap {
  const map: ColumnMap = { ...EMPTY_MAP }
  const used = new Set<number>()
  const headers = row.map((c) => normalizeHeader(c ?? ""))
  for (const [field, keywords] of FIELD_KEYWORDS) {
    // 키워드 우선순위대로 — 먼저 나오는 키워드가 이긴다(예: '기재내용'이 '적요'보다 거래처로 우선).
    for (const kw of keywords) {
      const idx = headers.findIndex((h, i) => !used.has(i) && h.length > 0 && h.includes(kw))
      if (idx >= 0) {
        map[field] = idx
        used.add(idx)
        break
      }
    }
  }
  return map
}

export function isUsableMap(m: ColumnMap): boolean {
  return m.date != null && m.description != null && (m.deposit != null || m.withdraw != null || m.amount != null)
}

/** 앞쪽 40행 안에서 머리행을 찾는다(은행 파일은 위에 계좌정보·조회기간이 붙어 있는 경우가 많다). */
export function detectHeader(rows: string[][]): { headerRow: number; map: ColumnMap } | null {
  let best: { headerRow: number; map: ColumnMap; score: number } | null = null
  const limit = Math.min(rows.length, 40)
  for (let r = 0; r < limit; r++) {
    const map = mapHeaderRow(rows[r] ?? [])
    if (!isUsableMap(map)) continue
    const score = Object.values(map).filter((v) => v != null).length
    if (!best || score > best.score) best = { headerRow: r, map, score }
  }
  return best ? { headerRow: best.headerRow, map: best.map } : null
}

/** "1,234,000원" · "-5,000" · "(5,000)" → 숫자. 빈칸·0·숫자 아님 → null. */
export function parseAmount(raw: string | null | undefined): number | null {
  if (raw == null) return null
  let s = String(raw).trim()
  if (!s) return null
  let neg = false
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[,\s원₩]/g, "")
  if (s.startsWith("-")) {
    neg = !neg
    s = s.slice(1)
  } else if (s.startsWith("+")) {
    s = s.slice(1)
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

const pad = (n: number) => String(n).padStart(2, "0")

/** "2026.09.29 13:22:05" · "2026-09-29" · "2026/9/3" · "20260929" · "26.09.29" → {date, time}. */
export function parseDateTime(raw: string | null | undefined): { date: string; time: string | null } | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  let y: number, mo: number, d: number
  let rest = ""
  const sep = s.match(/^(\d{2}|\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?(.*)$/)
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})(.*)$/)
  if (sep) {
    y = Number(sep[1])
    mo = Number(sep[2])
    d = Number(sep[3])
    rest = sep[4]
  } else if (compact) {
    y = Number(compact[1])
    mo = Number(compact[2])
    d = Number(compact[3])
    rest = compact[4]
  } else {
    return null
  }
  if (y < 100) y += 2000
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null
  const t = rest.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  const time = t ? `${pad(Number(t[1]))}:${t[2]}:${t[3] ?? "00"}` : null
  return { date: `${y}-${pad(mo)}-${pad(d)}`, time }
}

function parseTime(raw: string | null | undefined): string | null {
  if (!raw) return null
  const t = String(raw).trim().match(/^(\d{1,2}):?(\d{2}):?(\d{2})?/)
  return t ? `${pad(Number(t[1]))}:${t[2]}:${t[3] ?? "00"}` : null
}

const OUT_WORDS = /출금|지급|찾으신|출|-/
const IN_WORDS = /입금|맡기신|받으신|입|\+/

/** 머리행 아래를 거래로 변환. 날짜가 안 읽히는 행(합계·안내문)은 건너뛴다. */
export function parseRows(
  rows: string[][],
  headerRow: number,
  map: ColumnMap,
): { txns: BankTxn[]; skipped: number } {
  const txns: BankTxn[] = []
  let skipped = 0
  const cell = (row: string[], i: number | null) => (i == null ? "" : String(row[i] ?? "").trim())
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    if (row.every((c) => !String(c ?? "").trim())) continue // 빈 줄은 조용히 무시
    const dt = parseDateTime(cell(row, map.date))
    if (!dt) {
      skipped++
      continue
    }
    let direction: BankDirection | null = null
    let amount = 0
    const dep = parseAmount(cell(row, map.deposit))
    const wd = parseAmount(cell(row, map.withdraw))
    if (dep != null && dep !== 0) {
      direction = dep > 0 ? "in" : "out"
      amount = Math.abs(dep)
    } else if (wd != null && wd !== 0) {
      direction = wd > 0 ? "out" : "in"
      amount = Math.abs(wd)
    } else {
      const amt = parseAmount(cell(row, map.amount))
      if (amt != null && amt !== 0) {
        amount = Math.abs(amt)
        const dirText = cell(row, map.direction)
        if (dirText) direction = OUT_WORDS.test(dirText) ? "out" : IN_WORDS.test(dirText) ? "in" : null
        if (!direction) direction = amt < 0 ? "out" : "in"
      }
    }
    if (!direction || amount === 0) {
      skipped++
      continue
    }
    const description = cell(row, map.description) || cell(row, map.memo) || "(내용 없음)"
    const memoRaw = cell(row, map.memo)
    txns.push({
      date: dt.date,
      time: dt.time ?? parseTime(cell(row, map.time)),
      direction,
      amount,
      balance: parseAmount(cell(row, map.balance)),
      description,
      memo: memoRaw && memoRaw !== description ? memoRaw : null,
    })
  }
  return { txns, skipped }
}

/** 거래 지문의 원문 키. 같은 파일 안의 완전 동일 거래(잔액·시각 없음)는 등장 순번으로 구분한다. */
export function fingerprintKeys(txns: BankTxn[]): string[] {
  const seen = new Map<string, number>()
  return txns.map((t) => {
    const base = [t.date, t.time ?? "", t.direction, t.amount, t.balance ?? "", t.description.replace(/\s+/g, " ")].join("|")
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return `${base}#${n}`
  })
}

/** SHA-256 앞 32자(hex). 브라우저·Node 20+ 공용(crypto.subtle). */
export async function hashKey(key: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))
  return Array.from(new Uint8Array(buf).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("")
}

/** 거래처 이름 정규화 — 과거 분류 기억(history)의 키. */
export function vendorKey(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase()
}

// 이름만으로 추측 가능한 흔한 경우만. 모르면 '기타' — 사람이 미리보기에서 고친다.
const OUT_RULES: [RegExp, string][] = [
  [/급여|월급|상여|4대보험|국민연금|건강보험|고용보험/, "인건비"],
  [/택배|cj대한통운|대한통운|로젠|한진|우체국|롯데택배|경동|배송|물류|풀필먼트/i, "물류비용"],
  [/광고|메타|facebook|페이스북|인스타|google|구글|네이버광고|카카오광고|애드|마케팅/i, "마케팅비용"],
  [/가비아|도메인|호스팅|aws|vercel|supabase|github|notion|slack|figma|구독/i, "도메인/계정"],
  [/시험|검사|인증|성적서/, "인증/검사"],
]
const IN_RULES: [RegExp, string][] = [
  [/네이버|스마트스토어|naver/i, "네이버스마트"],
  [/쿠팡|coupang/i, "쿠팡(일반)"],
  [/컬리|kurly/i, "컬리"],
]

/** 분류 제안: ① 같은 거래처를 예전에 어떻게 분류했는지 ② 이름 규칙 ③ '기타'. */
export function suggestCategory(t: Pick<BankTxn, "direction" | "description" | "memo">, history: Map<string, string>): string {
  const remembered = history.get(`${t.direction}:${vendorKey(t.description)}`)
  if (remembered) return remembered
  const text = `${t.description} ${t.memo ?? ""}`
  for (const [re, cat] of t.direction === "out" ? OUT_RULES : IN_RULES) if (re.test(text)) return cat
  return "기타"
}
