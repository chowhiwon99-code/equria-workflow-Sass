"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus, Trash2, CalendarDays } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Json } from "@/lib/supabase/types"
import {
  type LeavePolicy,
  type WorkPolicy,
  type Holiday,
  resolveLeavePolicy,
  resolveWorkPolicy,
  resolveHolidays,
} from "@/lib/hr"

const inputCls = "h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
const numCls = "h-9 w-20 rounded-lg border bg-background px-2.5 text-right text-sm outline-none focus:ring-2 focus:ring-ring tabular-nums"

/** 회사 HR 기준 — 오너 전용(SettingsView가 isOwner로 게이팅). 읽기=멤버·쓰기=오너 RLS(hr_settings). */
export function HrSettingsCard() {
  const supabase = createClient()
  const wsId = useCurrentWorkspaceId()
  const meId = useCurrentUserId()
  const [leave, setLeave] = useState<LeavePolicy>(() => resolveLeavePolicy(null))
  const [work, setWork] = useState<WorkPolicy>(() => resolveWorkPolicy(null))
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!wsId) return
    const { data } = await supabase
      .from("hr_settings")
      .select("leave_policy, work_policy, holidays")
      .eq("workspace_id", wsId)
      .maybeSingle()
    setLeave(resolveLeavePolicy(data?.leave_policy))
    setWork(resolveWorkPolicy(data?.work_policy))
    setHolidays(resolveHolidays(data?.holidays))
  }, [supabase, wsId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 HR 설정 로드
    void load()
  }, [load])

  const save = async () => {
    if (!wsId) return
    setBusy(true)
    const cleanHolidays = holidays.filter((h) => h.date).sort((a, b) => a.date.localeCompare(b.date))
    const { error } = await supabase.from("hr_settings").upsert(
      {
        workspace_id: wsId,
        leave_policy: leave as unknown as Json,
        work_policy: work as unknown as Json,
        holidays: cleanHolidays as unknown as Json,
        updated_by: meId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" },
    )
    setBusy(false)
    if (error) return toast.error("저장에 실패했어요. (오너만 변경할 수 있어요)")
    setHolidays(cleanHolidays)
    toast.success("HR 설정을 저장했어요.")
  }

  const patchLeave = (p: Partial<LeavePolicy>) => setLeave((v) => ({ ...v, ...p }))
  const patchTenure = (p: Partial<LeavePolicy["tenure_bonus"]>) => setLeave((v) => ({ ...v, tenure_bonus: { ...v.tenure_bonus, ...p } }))

  return (
    <div className="flex flex-col gap-5">
      {/* ── 휴가 기준 ── */}
      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold">휴가 기준</h3>

        <Row label="연차 부여 방식" hint="입사일 기준 = 각자 입사일 1년 주기 · 회계연도 = 매년 같은 날 일괄">
          <Toggle
            value={leave.grant_method}
            options={[
              { value: "hire_date", label: "입사일 기준" },
              { value: "fiscal", label: "회계연도" },
            ]}
            onChange={(v) => patchLeave({ grant_method: v as LeavePolicy["grant_method"] })}
          />
        </Row>

        {leave.grant_method === "fiscal" && (
          <Row label="회계연도 시작(월-일)">
            <input
              value={leave.fiscal_start}
              onChange={(e) => patchLeave({ fiscal_start: e.target.value })}
              placeholder="01-01"
              className={cn(inputCls, "w-28")}
            />
          </Row>
        )}

        <Row label="기본 연차" hint="입사 1년 이상 · 법정 15일">
          <NumInput value={leave.annual_base} min={0} max={40} onChange={(n) => patchLeave({ annual_base: n })} suffix="일" />
        </Row>

        <Row label="근속 가산">
          <Toggle
            value={leave.tenure_bonus.enabled ? "on" : "off"}
            options={[
              { value: "on", label: "사용" },
              { value: "off", label: "안 함" },
            ]}
            onChange={(v) => patchTenure({ enabled: v === "on" })}
          />
        </Row>
        {/* 근속 가산 상세 — 딸린 옵션이므로 들여쓰기만 하고 배경은 빼 시선을 뺏지 않게.
            읽으면 "3년 이상부터 2년마다 1일씩 더, 25일까지"라는 한 문장이 된다. */}
        {leave.tenure_bonus.enabled && (
          <div className="ml-3 flex flex-wrap items-center gap-x-2 gap-y-2 border-l pl-4 text-xs text-muted-foreground">
            <NumInput compact value={leave.tenure_bonus.start_year} min={1} max={30} onChange={(n) => patchTenure({ start_year: n })} suffix="년 이상부터" suffixWidth="w-[4.2rem]" />
            <NumInput compact value={leave.tenure_bonus.every_years} min={1} max={10} onChange={(n) => patchTenure({ every_years: n })} suffix="년마다" suffixWidth="w-10" />
            <NumInput compact value={leave.tenure_bonus.plus_days} min={0} max={10} onChange={(n) => patchTenure({ plus_days: n })} suffix="일씩" suffixWidth="w-7" />
            <NumInput compact value={leave.tenure_bonus.max_days} min={0} max={60} onChange={(n) => patchTenure({ max_days: n })} suffix="일까지" suffixWidth="w-10" />
          </div>
        )}

        <Row label="입사 1년 미만 월 1일 부여" hint="개근한 달마다 1일 (최대 11일)">
          <Toggle
            value={leave.first_year_monthly ? "on" : "off"}
            options={[
              { value: "on", label: "사용" },
              { value: "off", label: "안 함" },
            ]}
            onChange={(v) => patchLeave({ first_year_monthly: v === "on" })}
          />
        </Row>

        <Row label="반차 기준 시간">
          <NumInput value={leave.half_day_hours} min={1} max={8} onChange={(n) => patchLeave({ half_day_hours: n })} suffix="시간" />
        </Row>

        <Row label="월차 별도 운영" hint="연차와 별개로 매달 부여하는 회사만">
          <div className="flex items-center gap-2">
            <Toggle
              value={leave.monthly_leave.enabled ? "on" : "off"}
              options={[
                { value: "on", label: "사용" },
                { value: "off", label: "안 함" },
              ]}
              onChange={(v) => setLeave((s) => ({ ...s, monthly_leave: { ...s.monthly_leave, enabled: v === "on" } }))}
            />
            {leave.monthly_leave.enabled && (
              <NumInput
                value={leave.monthly_leave.days}
                min={0}
                max={31}
                onChange={(n) => setLeave((s) => ({ ...s, monthly_leave: { ...s.monthly_leave, days: n } }))}
                suffix="일/월"
              />
            )}
          </div>
        </Row>
      </section>

      {/* ── 근무시간 ── */}
      <section className="flex flex-col gap-4 border-t pt-5">
        <h3 className="text-sm font-semibold">근무시간</h3>
        <Row label="표준 근무시간">
          <div className="flex items-center gap-1.5">
            <input type="time" value={work.standard_start} onChange={(e) => setWork((v) => ({ ...v, standard_start: e.target.value }))} className={cn(inputCls, "w-32")} />
            <span className="shrink-0 text-xs text-muted-foreground">~</span>
            <input type="time" value={work.standard_end} onChange={(e) => setWork((v) => ({ ...v, standard_end: e.target.value }))} className={cn(inputCls, "w-32")} />
          </div>
        </Row>
        <Row label="주 근무시간">
          <NumInput value={work.weekly_hours} min={0} max={80} onChange={(n) => setWork((v) => ({ ...v, weekly_hours: n }))} suffix="시간" />
        </Row>
        <Row label="유연근무제" hint="출퇴근 시각 자율">
          <Toggle
            value={work.flex ? "on" : "off"}
            options={[
              { value: "on", label: "사용" },
              { value: "off", label: "안 함" },
            ]}
            onChange={(v) => setWork((s) => ({ ...s, flex: v === "on" }))}
          />
        </Row>
      </section>

      {/* ── 회사 휴무일 ── */}
      <section className="flex flex-col gap-3 border-t pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">회사 휴무일·공휴일</h3>
          <button
            type="button"
            onClick={() => setHolidays((h) => [...h, { date: "", name: "" }])}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80"
          >
            <Plus className="size-3.5" /> 추가
          </button>
        </div>
        {holidays.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" /> 등록된 휴무일이 없어요. 근무일·연차 계산에서 제외돼요.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {holidays.map((h, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={h.date}
                  onChange={(e) => setHolidays((arr) => arr.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
                  className={cn(inputCls, "w-40 [color-scheme:light] dark:[color-scheme:dark]")}
                />
                <input
                  value={h.name}
                  onChange={(e) => setHolidays((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  placeholder="휴무일 이름"
                  className={cn(inputCls, "flex-1")}
                />
                <button
                  type="button"
                  onClick={() => setHolidays((arr) => arr.filter((_, j) => j !== i))}
                  className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive"
                  aria-label="삭제"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button onClick={save} disabled={busy || !wsId}>
          {busy ? "저장 중…" : "HR 설정 저장"}
        </Button>
        <p className="text-xs text-muted-foreground">이 기준으로 근태의 연차·반차 잔여가 계산돼요.</p>
      </div>
    </div>
  )
}

/**
 * 설정 한 줄 — 왼쪽 라벨(+보조설명), 오른쪽 컨트롤.
 *
 * 컨트롤 열을 **고정 폭(17rem)** 으로 잡는 게 핵심이다. 컨트롤 종류가 토글·숫자+단위·시간범위로
 * 제각각이라, 내용 폭에 맡기면 행마다 오른쪽 끝이 달라져 "정렬이 안 맞아" 보인다.
 * 카드가 max-w-2xl(672px)이므로 17rem을 떼도 라벨 열에 충분한 폭이 남는다.
 */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-x-4 gap-y-2 sm:grid-cols-[1fr_17rem]">
      <div className="min-w-0">
        <p className="text-sm leading-tight">{label}</p>
        {/* 라벨이 먼저 읽히도록 보조설명은 한 톤 더 작고 옅게 */}
        {hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground/70">{hint}</p>}
      </div>
      <div className="flex items-center justify-end">{children}</div>
    </div>
  )
}

/** 숫자 + 단위. 단위 칸을 고정 폭으로 두어 '일'·'시간'처럼 길이가 달라도 숫자 박스가 세로로 정렬된다. */
function NumInput({
  value,
  min,
  max,
  onChange,
  suffix,
  suffixWidth = "w-9",
  compact = false,
}: {
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  suffix?: string
  suffixWidth?: string
  /** 근속 가산처럼 한 줄에 여러 개가 들어가는 자리 — 입력칸을 좁게 */
  compact?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
        }}
        className={cn(numCls, compact && "w-16")}
      />
      {suffix && <span className={cn("shrink-0 text-left", suffixWidth)}>{suffix}</span>}
    </span>
  )
}

function Toggle({ value, options, onChange }: { value: string; options: readonly { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center rounded-full bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === o.value ? "bg-card text-foreground shadow-[var(--shadow-sm)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
