"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { Trash2, CircleCheck, TriangleAlert, CircleX } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { MANUAL_STATUSES } from "@/components/chat/StatusDot"
import { Loading, ErrorState } from "@/components/shared/States"
import { formatUsd } from "@/lib/pricing"
import { McpCredentialsCard } from "./McpCredentialsCard"

const THEMES = [
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
]

// 구성원 디렉터리에서 항목별 공개 여부 (directory_contact RPC가 이 정책으로 게이팅)
const PRIVACY_FIELDS = [
  { key: "email", label: "이메일" },
  { key: "work_phone", label: "사내 전화" },
  { key: "mobile", label: "휴대폰" },
] as const

type ContactVisibility = "all" | "private"
type ContactPrivacy = Record<(typeof PRIVACY_FIELDS)[number]["key"], ContactVisibility>

/** View Transitions API로 테마 전환을 화면 전체 크로스페이드(미지원 브라우저는 즉시 적용). */
function applyThemeSmooth(apply: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void }
  if (typeof document !== "undefined" && typeof doc.startViewTransition === "function") {
    doc.startViewTransition(apply)
  } else {
    apply()
  }
}

/** 섹션 카드 — 떠 있는 흰 카드(토스/애플) */
function Card({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl glass p-5">
      {children}
    </section>
  )
}

function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-base font-semibold">{title}</h2>
      {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

/**
 * iOS식 세그먼트 컨트롤 — 활성 표시(썸)가 칸 사이를 부드럽게 슬라이드(translateX 트랜지션).
 * 라이브러리 없이 절대위치 썸 + transform 전환. block=가로 꽉 채움.
 */
function Segmented({
  options,
  value,
  onChange,
  block,
}: {
  options: readonly { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  block?: boolean
}) {
  const activeIndex = options.findIndex((o) => o.value === value)
  // 슬라이드 시작 인덱스 — 클릭 시점의 현재 위치를 이벤트 핸들러에서 저장(render중 ref접근/effect-setState 회피).
  // keyframe(animation)으로 from→to 슬라이드: next-themes가 테마 전환 시 transition을 꺼도 animation은 동작.
  const [fromIndex, setFromIndex] = useState(activeIndex)
  const from = fromIndex >= 0 && fromIndex < options.length ? fromIndex : activeIndex
  const handle = (target: string) => {
    setFromIndex(activeIndex)
    onChange(target)
  }
  return (
    <div className={cn("relative flex items-center rounded-full bg-muted p-0.5", block ? "w-full" : "inline-flex")}>
      {/* 슬라이딩 썸 — keyframe으로 이전→현재 칸으로 미끄러짐(transition 아님 → 테마 전환에도 동작) */}
      {activeIndex >= 0 && (
        <span
          key={activeIndex}
          aria-hidden
          className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-full bg-card shadow-[var(--shadow-sm)] motion-safe:animate-[seg-thumb_0.32s_cubic-bezier(0.32,0.72,0,1)_both]"
          style={{
            width: `calc((100% - 0.25rem) / ${options.length})`,
            transform: `translateX(${activeIndex * 100}%)`,
            ["--seg-from" as string]: `${from * 100}%`,
            ["--seg-to" as string]: `${activeIndex * 100}%`,
          }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => handle(o.value)}
          className={cn(
            "relative z-10 flex-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
            block && "py-2 text-sm",
            value === o.value ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsView() {
  const supabase = createClient()
  const meId = useCurrentUserId()
  const router = useRouter()
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [department, setDepartment] = useState("")
  const [role, setRole] = useState("member")
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [position, setPosition] = useState("")
  // 대표(오너) 전용 — 구성원 직급 일괄 관리
  const [isOwner, setIsOwner] = useState(false)
  const [memberList, setMemberList] = useState<{ id: string; name: string; department: string | null; position: string | null }[]>([])
  // 대표(오너) 전용 — 구성원별 AI 사용량(호출·토큰·비용). 내용은 없고 사용량 메타만(RPC가 오너 게이팅).
  const [usage, setUsage] = useState<
    { user_id: string; name: string; calls: number; tokens_input: number; tokens_output: number; cost_usd: number; month_cost_usd: number }[] | null
  >(null)
  // 대표(오너) 전용 — 시스템 점검(설정 실수 미리 감지)
  const [health, setHealth] = useState<{ name: string; status: "ok" | "warn" | "fail"; detail: string; fix?: string }[] | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [workPhone, setWorkPhone] = useState("")
  const [mobile, setMobile] = useState("")
  const [privacy, setPrivacy] = useState<ContactPrivacy>({
    email: "all",
    work_phone: "all",
    mobile: "private",
  })
  // AI 비용 예산(이번 달 사용액·월 한도)
  const [budget, setBudget] = useState<{ spent: number; limit: number | null; isAdmin: boolean } | null>(null)
  const [budgetInput, setBudgetInput] = useState("")
  const [savingBudget, setSavingBudget] = useState(false)

  // 테마는 클라이언트에서만 확정(hydration mismatch 방지)
  useEffect(() => setMounted(true), [])

  const load = useCallback(async () => {
    try {
      if (!meId) {
        setLoading(false)
        return
      }
      const { data } = await supabase
        .from("profiles")
        .select("name, department, role, status_manual, position, contact_privacy")
        .eq("id", meId)
        .single()
      if (data) {
        setName(data.name ?? "")
        setDepartment(data.department ?? "")
        setRole(data.role ?? "member")
        setStatus(data.status_manual ?? "active")
        setPosition(data.position ?? "")
        const cp = (data.contact_privacy ?? {}) as Partial<ContactPrivacy>
        setPrivacy({
          email: cp.email ?? "all",
          work_phone: cp.work_phone ?? "all",
          mobile: cp.mobile ?? "private",
        })
      }
      // 연락처(email/work_phone/mobile)는 컬럼 권한 회수(마이그 023b)로 직접 select 불가 → RPC(self)로 조회
      const { data: contact } = await supabase.rpc("directory_contact", { target: meId })
      const c = contact?.[0]
      setEmail(c?.email ?? "")
      setWorkPhone(c?.work_phone ?? "")
      setMobile(c?.mobile ?? "")
      // 대표면 구성원 직급 관리용 목록도 로드
      const { data: ws } = await supabase.from("workspaces").select("owner_id").limit(1).maybeSingle()
      const owner = !!ws?.owner_id && ws.owner_id === meId
      setIsOwner(owner)
      if (owner) {
        const { data: mem } = await supabase.from("profiles").select("id, name, department, position").order("name")
        setMemberList((mem as { id: string; name: string; department: string | null; position: string | null }[]) ?? [])
        const { data: usageRows } = await supabase.rpc("admin_usage_by_member")
        setUsage(usageRows ?? [])
      }
      // AI 비용 예산 — 이번 달 사용액·월 한도(조회 실패는 무시)
      try {
        const bRes = await fetch("/api/budget")
        if (bRes.ok) {
          const b = (await bRes.json()) as { spent: number; limit: number | null; isAdmin: boolean }
          setBudget(b)
          setBudgetInput(b.limit == null ? "" : String(b.limit))
        }
      } catch {
        /* 예산 조회 실패는 설정 로드를 막지 않음 */
      }
      setError(null)
    } catch {
      setError("설정을 불러오지 못했어요. 다시 시도해 주세요.")
    } finally {
      setLoading(false)
    }
  }, [supabase, meId])

  useEffect(() => {
    load()
  }, [load])

  const saveProfile = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    if (!meId) {
      setSaving(false)
      return
    }
    try {
      await mustOk(
        supabase
          .from("profiles")
          .update({
            name: name.trim(),
            department: department.trim() || null,
            work_phone: workPhone.trim() || null,
            mobile: mobile.trim() || null,
            contact_privacy: privacy,
          })
          .eq("id", meId)
      )
      toast.success("프로필을 저장했어요.")
      router.refresh() // 서버 레이아웃 재요청 → Header 이름 갱신
    } catch {
      toast.error("저장에 실패했어요. 다시 시도해 주세요.")
    } finally {
      setSaving(false)
    }
  }

  const saveBudget = async () => {
    setSavingBudget(true)
    try {
      const raw = budgetInput.trim()
      const monthly_budget_usd = raw === "" ? null : Number(raw)
      const res = await fetch("/api/budget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly_budget_usd }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "저장 실패")
      setBudget((b) => (b ? { ...b, limit: j.limit ?? null } : b))
      setBudgetInput(j.limit == null ? "" : String(j.limit))
      toast.success("AI 예산 한도를 저장했어요.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했어요.")
    } finally {
      setSavingBudget(false)
    }
  }

  const setMyStatus = async (value: string) => {
    setStatus(value)
    if (!meId) return
    await supabase.from("profiles").update({ status_manual: value }).eq("id", meId)
    toast.success("상태를 변경했어요.")
  }

  const saveMemberInfo = async (id: string, dept: string, position: string) => {
    const m = memberList.find((x) => x.id === id)
    setBusyId(id)
    try {
      if (m && dept !== (m.department ?? "")) {
        const { error } = await supabase.rpc("set_member_department", { target: id, new_department: dept })
        if (error) throw new Error(error.message)
      }
      if (m && position !== (m.position ?? "")) {
        const { error } = await supabase.rpc("set_member_position", { target: id, new_position: position })
        if (error) throw new Error(error.message)
      }
      toast.success("저장했어요.")
      await load()
    } catch {
      toast.error("변경에 실패했어요.")
    } finally {
      setBusyId(null)
    }
  }

  // 오너 전용 — 구성원 계정 완전 삭제(개인 데이터 연쇄 삭제, 공유 자원은 보존).
  const deleteMember = async (id: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/members/${id}`, { method: "DELETE" })
      if (res.ok) {
        setMemberList((prev) => prev.filter((m) => m.id !== id))
        setUsage((prev) => (prev ? prev.filter((u) => u.user_id !== id) : prev))
        toast.success("구성원을 삭제했어요.")
      } else {
        toast.error((await res.text().catch(() => "")) || "삭제에 실패했어요.")
      }
    } finally {
      setBusyId(null)
    }
  }

  // 시스템 점검 — 설정(앱 주소·비번·구글 콜백·키) 실수를 미리 감지
  const runHealth = async () => {
    setHealthLoading(true)
    try {
      const res = await fetch("/api/health")
      if (res.ok) setHealth((await res.json()).checks ?? [])
      else toast.error("점검을 실행하지 못했어요.")
    } catch {
      toast.error("점검을 실행하지 못했어요.")
    } finally {
      setHealthLoading(false)
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  if (loading) return <Loading rows={4} />
  if (error)
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setError(null)
          setLoading(true)
          load()
        }}
      />
    )

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {/* 프로필 */}
      <Card>
        <SectionTitle title="프로필" desc="이름·부서·연락처와 다른 직원에게 보일 정보를 관리해요." />
        <div className="flex flex-col gap-3.5">
          <Field label="이름">
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="부서">
            <input className={fieldClass} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="예: 마케팅팀" />
          </Field>
          <Field label="직급">
            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3.5 py-2.5 text-sm">
              <span className={position ? "font-medium" : "text-muted-foreground"}>{position || "미지정"}</span>
              <span className="text-xs text-muted-foreground">{isOwner ? "아래 ‘구성원 직급’에서 설정" : "대표가 설정해요"}</span>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="사내 전화">
              <input className={fieldClass} value={workPhone} onChange={(e) => setWorkPhone(e.target.value)} placeholder="예: 02-000-0000" />
            </Field>
            <Field label="휴대폰">
              <input className={fieldClass} value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="예: 010-0000-0000" />
            </Field>
          </div>
        </div>

        {/* 역할 */}
        <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3.5 py-2.5 text-sm">
          <span className="text-muted-foreground">역할</span>
          <span className="font-medium">{role === "admin" ? "관리자" : "멤버"}</span>
        </div>

        {/* 상태 */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            상태 <span className="font-normal">· 다른 직원에게 표시</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {MANUAL_STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setMyStatus(s.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  (status ?? "active") === s.value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <span className={cn("size-2 rounded-full", s.color)} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 연락처 공개 범위 */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            연락처 공개 범위 <span className="font-normal">· 구성원 디렉터리</span>
          </span>
          <div className="flex flex-col gap-1.5">
            {PRIVACY_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center justify-between rounded-xl bg-muted/40 px-3.5 py-2 text-sm">
                <span>{f.label}</span>
                <Segmented
                  options={[
                    { value: "all", label: "공개" },
                    { value: "private", label: "비공개" },
                  ]}
                  value={privacy[f.key]}
                  onChange={(v) => setPrivacy((p) => ({ ...p, [f.key]: v as ContactVisibility }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-0.5">
          <Button size="sm" onClick={saveProfile} disabled={!name.trim() || saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </Card>

      {/* 대표: 구성원 부서·직급 일괄 관리 */}
      {isOwner && (
        <Card>
          <SectionTitle title="구성원 부서·직급" desc="대표가 직원별 부서·직급을 지정해요. (직원 본인은 자기 프로필에서 부서만 바꿀 수 있어요.)" />
          {memberList.length === 0 ? (
            <p className="text-sm text-muted-foreground">구성원이 없어요.</p>
          ) : (
            <div className="flex flex-col divide-y overflow-hidden rounded-xl border">
              {memberList.map((m) => (
                <MemberInfoRow key={m.id} member={m} isMe={m.id === meId} busy={busyId === m.id} onSave={(dept, pos) => saveMemberInfo(m.id, dept, pos)} onDelete={() => deleteMember(m.id)} />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 대표: 구성원별 AI 사용량 (호출·토큰·비용만, 대화 내용은 보이지 않음) */}
      {isOwner && (
        <Card>
          <SectionTitle
            title="구성원별 AI 사용량"
            desc="누가 얼마나 AI를 썼는지 봐요. 사용량·비용만 보이고, 대화 내용은 보이지 않아요."
          />
          {!usage || usage.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 사용 기록이 없어요.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">구성원</th>
                    <th className="px-3 py-2 text-right font-medium">호출</th>
                    <th className="px-3 py-2 text-right font-medium">토큰</th>
                    <th className="px-3 py-2 text-right font-medium">이번 달</th>
                    <th className="px-3 py-2 text-right font-medium">누적 비용</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {usage.map((u) => (
                    <tr key={u.user_id}>
                      <td className="px-3 py-2 font-medium">{u.name || "이름 없음"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{Number(u.calls).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {(Number(u.tokens_input) + Number(u.tokens_output)).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">${Number(u.month_cost_usd).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">${Number(u.cost_usd).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* 대표: MCP 앱 크리덴셜(구글·Slack·PayPal OAuth 앱 등록) — 자체 완결 컴포넌트 */}
      {isOwner && <McpCredentialsCard />}

      {/* 대표: 시스템 점검 — 설정 실수 미리 잡기 */}
      {isOwner && (
        <Card>
          <SectionTitle title="시스템 점검" desc="앱 주소·공용비번·구글 연동·키 설정을 훑어서 문제를 미리 잡아요." />
          <Button size="sm" className="mb-3 h-8 self-start" onClick={runHealth} disabled={healthLoading}>
            {healthLoading ? "점검 중…" : "점검 실행"}
          </Button>
          {health && (
            <div className="flex flex-col divide-y overflow-hidden rounded-xl border">
              {health.map((c) => (
                <div key={c.name} className="flex items-start gap-2.5 px-3.5 py-2.5 text-sm">
                  <span className="mt-0.5 shrink-0">
                    {c.status === "ok" ? <CircleCheck className="size-4 text-success" /> : c.status === "warn" ? <TriangleAlert className="size-4 text-warning" /> : <CircleX className="size-4 text-destructive" />}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {c.name} <span className="font-normal text-muted-foreground">— {c.detail}</span>
                    </p>
                    {c.fix && c.status !== "ok" && <p className="mt-0.5 text-xs text-muted-foreground">→ {c.fix}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 화면(테마) */}
      <Card>
        <SectionTitle title="화면" desc="밝기 테마를 선택해요." />
        <Segmented
          block
          options={THEMES}
          value={mounted ? resolvedTheme ?? "dark" : ""}
          onChange={(v) => applyThemeSmooth(() => setTheme(v))}
        />
      </Card>

      {/* 워크스페이스 */}
      <Card>
        <SectionTitle title="워크스페이스" desc="현재 소속된 워크스페이스예요." />
        <div className="overflow-hidden rounded-xl border text-sm">
          <div className="flex items-center justify-between border-b px-3.5 py-2.5">
            <span className="text-muted-foreground">이름</span>
            <span className="font-medium">Complow 워크스페이스</span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-muted-foreground">로그인 계정</span>
            <span className="font-medium">{name || email}</span>
          </div>
        </div>
      </Card>

      {/* AI 비용 예산 */}
      <Card>
        <SectionTitle
          title="AI 비용 예산"
          desc="에이전트·워크플로우가 쓰는 Claude 비용의 월 한도예요. 초과하면 관리자 외에는 AI 실행이 차단돼요."
        />
        {budget && (
          <div className="overflow-hidden rounded-xl border text-sm">
            <div className="flex items-center justify-between border-b px-3.5 py-2.5">
              <span className="text-muted-foreground">이번 달 사용액</span>
              <span className="font-medium">{formatUsd(budget.spent)}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-muted-foreground">월 한도</span>
              <span className="font-medium">{budget.limit == null ? "무제한" : formatUsd(budget.limit)}</span>
            </div>
          </div>
        )}
        {role === "admin" && (
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">월 한도 (USD · 0 또는 빈칸 = 무제한)</span>
              <input
                type="number"
                min={0}
                step="1"
                className={fieldClass}
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder="예: 100"
              />
            </label>
            <Button size="sm" onClick={saveBudget} disabled={savingBudget}>
              {savingBudget ? "저장 중…" : "저장"}
            </Button>
          </div>
        )}
      </Card>

      {/* 계정 */}
      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle title="계정" desc="이 기기에서 로그아웃합니다." />
          <Button size="sm" variant="outline" onClick={logout}>
            로그아웃
          </Button>
        </div>
      </Card>
    </div>
  )
}

/** 대표용 구성원 부서·직급 한 줄 — 자유 입력 + 저장(set_member_department / set_member_position RPC). */
function MemberInfoRow({
  member,
  isMe,
  busy,
  onSave,
  onDelete,
}: {
  member: { id: string; name: string; department: string | null; position: string | null }
  isMe: boolean
  busy: boolean
  onSave: (dept: string, position: string) => void
  onDelete: () => void
}) {
  const [dept, setDept] = useState(member.department ?? "")
  const [pos, setPos] = useState(member.position ?? "")
  const [confirming, setConfirming] = useState(false)
  const dirty = dept.trim() !== (member.department ?? "") || pos.trim() !== (member.position ?? "")
  return (
    <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
      <span className="min-w-0 text-sm font-medium">
        {member.name}
        {isMe && <span className="ml-1 text-xs font-normal text-muted-foreground">(나)</span>}
      </span>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave(dept.trim(), pos.trim())
        }}
        className="ml-auto flex flex-wrap items-center gap-1.5"
      >
        <input
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          placeholder="부서"
          className="h-8 w-24 rounded-lg border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={pos}
          onChange={(e) => setPos(e.target.value)}
          placeholder="직급"
          className="h-8 w-24 rounded-lg border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
        <Button size="sm" className="h-8" type="submit" disabled={busy || !dirty}>
          저장
        </Button>
      </form>
      {/* 오너 전용 삭제 — 본인은 못 지움. 2단계 확인(오삭 방지). */}
      {!isMe &&
        (confirming ? (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">계정·개인데이터 삭제?</span>
            <Button size="sm" variant="destructive" className="h-8" onClick={onDelete} disabled={busy}>
              삭제
            </Button>
            <button type="button" onClick={() => setConfirming(false)} className="text-muted-foreground hover:text-foreground">
              취소
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
            title={`${member.name} 구성원 삭제`}
            aria-label={`${member.name} 삭제`}
          >
            <Trash2 className="size-4" />
          </button>
        ))}
      {/* 본인 행 — 삭제 버튼 자리를 비워두면 입력칸이 밀려 열이 어긋남 → 같은 폭 placeholder로 정렬 유지 */}
      {isMe && <span className="w-6" aria-hidden />}
    </div>
  )
}
