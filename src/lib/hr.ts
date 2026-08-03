// HR(인사) 정책 — 회사별 휴가/근무 기준의 기본값 + 근속 기반 연차 부여 산식(순수함수).
//
// DB(hr_settings.leave_policy / work_policy / holidays)는 jsonb라 회사가 일부만 저장할 수 있어,
// 여기 DEFAULT_*와 병합(resolve*)해 사용한다. jsonb 키는 SQL(마이그129 attendance_balances)이
// leave_policy->>'grant_method' 식으로 직접 읽으므로 **snake_case**로 통일(코드도 동일 키 사용).
//
// 부여량(granted)/잔여(remaining) 산식은 서버·클라 공용으로 여기서만 계산(SSOT). 마이그129 RPC는
// 인원별 [기준연도 창]과 used 집계(연차/반차/월차 건수)만 반환하고, 여기서 정책과 합쳐 잔여를 낸다.

export type LeavePolicy = {
  annual_base: number // 1년 이상 근속 기본 연차(법정 15)
  grant_method: "hire_date" | "fiscal" // 입사일 애니버서리 기준 vs 회계연도 일괄
  fiscal_start: string // 'MM-DD' (grant_method='fiscal'일 때 기준연도 시작)
  tenure_bonus: {
    enabled: boolean
    start_year: number // 가산 시작 근속연수(법정 3)
    every_years: number // 몇 년마다 가산(법정 2)
    plus_days: number // 가산 일수(법정 1)
    max_days: number // 상한(법정 25)
  }
  first_year_monthly: boolean // 입사 1년 미만 = 개근 시 월 1일(최대 11)
  half_day_hours: number // 반차 기준시간
  monthly_leave: { enabled: boolean; days: number } // 월차 별도 운영 회사
  carryover: { enabled: boolean; max_days: number } // 미사용 이월(잔여 반영은 후속)
}

export type WorkPolicy = {
  standard_start: string // 'HH:MM'
  standard_end: string
  weekly_hours: number
  flex: boolean
}

export type Holiday = { date: string; name: string }

// 근로기준법 기준 기본값(회사가 설정에서 덮어씀)
export const DEFAULT_LEAVE_POLICY: LeavePolicy = {
  annual_base: 15,
  grant_method: "hire_date",
  fiscal_start: "01-01",
  tenure_bonus: { enabled: true, start_year: 3, every_years: 2, plus_days: 1, max_days: 25 },
  first_year_monthly: true,
  half_day_hours: 4,
  monthly_leave: { enabled: false, days: 0 },
  carryover: { enabled: false, max_days: 0 },
}

export const DEFAULT_WORK_POLICY: WorkPolicy = {
  standard_start: "09:00",
  standard_end: "18:00",
  weekly_hours: 40,
  flex: false,
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback
}
function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback
}

/** 저장된 jsonb(부분 가능)를 기본값과 병합해 완전한 LeavePolicy로. */
export function resolveLeavePolicy(raw: unknown): LeavePolicy {
  const d = DEFAULT_LEAVE_POLICY
  if (!isObj(raw)) return d
  const tb = isObj(raw.tenure_bonus) ? raw.tenure_bonus : {}
  const ml = isObj(raw.monthly_leave) ? raw.monthly_leave : {}
  const co = isObj(raw.carryover) ? raw.carryover : {}
  return {
    annual_base: num(raw.annual_base, d.annual_base),
    grant_method: raw.grant_method === "fiscal" ? "fiscal" : "hire_date",
    fiscal_start: str(raw.fiscal_start, d.fiscal_start),
    tenure_bonus: {
      enabled: bool(tb.enabled, d.tenure_bonus.enabled),
      start_year: num(tb.start_year, d.tenure_bonus.start_year),
      every_years: Math.max(1, num(tb.every_years, d.tenure_bonus.every_years)),
      plus_days: num(tb.plus_days, d.tenure_bonus.plus_days),
      max_days: num(tb.max_days, d.tenure_bonus.max_days),
    },
    first_year_monthly: bool(raw.first_year_monthly, d.first_year_monthly),
    half_day_hours: num(raw.half_day_hours, d.half_day_hours),
    monthly_leave: { enabled: bool(ml.enabled, d.monthly_leave.enabled), days: num(ml.days, d.monthly_leave.days) },
    carryover: { enabled: bool(co.enabled, d.carryover.enabled), max_days: num(co.max_days, d.carryover.max_days) },
  }
}

export function resolveWorkPolicy(raw: unknown): WorkPolicy {
  const d = DEFAULT_WORK_POLICY
  if (!isObj(raw)) return d
  return {
    standard_start: str(raw.standard_start, d.standard_start),
    standard_end: str(raw.standard_end, d.standard_end),
    weekly_hours: num(raw.weekly_hours, d.weekly_hours),
    flex: bool(raw.flex, d.flex),
  }
}

export function resolveHolidays(raw: unknown): Holiday[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isObj)
    .map((h) => ({ date: str(h.date, ""), name: str(h.name, "") }))
    .filter((h) => h.date.length > 0)
}

function fullYears(from: Date, to: Date): number {
  let y = to.getFullYear() - from.getFullYear()
  const m = to.getMonth() - from.getMonth()
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) y--
  return y
}
function fullMonths(from: Date, to: Date): number {
  let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) m--
  return Math.max(0, m)
}

/**
 * 근속연수 기반 연차 부여일수.
 * - 입사일 미상 → annual_base(기본 부여).
 * - 1년 미만 → first_year_monthly면 근속 월수(최대 11), 아니면 0.
 * - 1년 이상 → annual_base + (근속가산, start_year부터 every_years마다 plus_days) 상한 max_days.
 */
export function computeGrantedLeave(policy: LeavePolicy, hireDate: string | null, asOf: Date): number {
  if (!hireDate) return policy.annual_base
  const hire = new Date(`${hireDate}T00:00:00`)
  if (Number.isNaN(hire.getTime())) return policy.annual_base
  const years = fullYears(hire, asOf)
  if (years < 1) {
    return policy.first_year_monthly ? Math.min(11, fullMonths(hire, asOf)) : 0
  }
  const tb = policy.tenure_bonus
  let granted = policy.annual_base
  if (tb.enabled && years >= tb.start_year) {
    // start_year부터 가산 시작(그 해 +plus_days), 이후 every_years마다 추가. 상한 max_days.
    // 법정 기본(start 3·every 2·plus 1): 3년 16 · 5년 17 … 25 상한. start_year≠3도 정확.
    const steps = Math.floor((years - tb.start_year) / tb.every_years) + 1
    granted = Math.min(policy.annual_base + steps * tb.plus_days, tb.max_days)
  }
  return granted
}

// 마이그129 attendance_balances RPC 한 행
export type AttendanceBalanceRow = {
  user_id: string
  name: string | null
  hire_date: string | null
  year_start: string
  year_end: string
  used_annual: number
  used_half: number
  used_monthly: number
}

export type LeaveBalance = {
  granted: number // 부여 연차
  used: number // 사용(연차 + 반차 0.5, 일 단위)
  remaining: number // 잔여 연차
  used_monthly: number // 월차 사용(별도 개념 — 정보성)
}

/** RPC 행 + 정책 → 인원 잔여. 반차는 0.5일. 월차는 별도 표기. */
export function computeBalance(policy: LeavePolicy, row: AttendanceBalanceRow, asOf: Date): LeaveBalance {
  const granted = computeGrantedLeave(policy, row.hire_date, asOf)
  const used = row.used_annual + row.used_half * 0.5
  const remaining = Math.round((granted - used) * 10) / 10
  return { granted, used, remaining, used_monthly: row.used_monthly }
}
