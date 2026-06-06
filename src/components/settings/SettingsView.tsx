"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { MANUAL_STATUSES } from "@/components/chat/StatusDot"
import { Loading, ErrorState } from "@/components/shared/States"

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

/** 섹션 카드 — 떠 있는 흰 카드(토스/애플) */
function Card({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-[var(--shadow-sm)]">
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
  return (
    <div className={cn("relative flex items-center rounded-full bg-muted p-0.5", block ? "w-full" : "inline-flex")}>
      {/* 슬라이딩 썸 — 활성 칸 위치로 미끄러짐 */}
      {activeIndex >= 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-full bg-card shadow-[var(--shadow-sm)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{
            width: `calc((100% - 0.25rem) / ${options.length})`,
            transform: `translateX(calc(${activeIndex} * 100%))`,
          }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
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
  const [workPhone, setWorkPhone] = useState("")
  const [mobile, setMobile] = useState("")
  const [privacy, setPrivacy] = useState<ContactPrivacy>({
    email: "all",
    work_phone: "all",
    mobile: "private",
  })

  // 테마는 클라이언트에서만 확정(hydration mismatch 방지)
  useEffect(() => setMounted(true), [])

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        setLoading(false)
        return
      }
      const { data } = await supabase
        .from("profiles")
        .select("name, department, role, status_manual, position, contact_privacy")
        .eq("id", auth.user.id)
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
      const { data: contact } = await supabase.rpc("directory_contact", { target: auth.user.id })
      const c = contact?.[0]
      setEmail(c?.email ?? "")
      setWorkPhone(c?.work_phone ?? "")
      setMobile(c?.mobile ?? "")
      setError(null)
    } catch {
      setError("설정을 불러오지 못했어요. 다시 시도해 주세요.")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const saveProfile = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
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
            position: position.trim() || null,
            work_phone: workPhone.trim() || null,
            mobile: mobile.trim() || null,
            contact_privacy: privacy,
          })
          .eq("id", auth.user.id)
      )
      toast.success("프로필을 저장했어요.")
      router.refresh() // 서버 레이아웃 재요청 → Header 이름 갱신
    } catch {
      toast.error("저장에 실패했어요. 다시 시도해 주세요.")
    } finally {
      setSaving(false)
    }
  }

  const setMyStatus = async (value: string) => {
    setStatus(value)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    await supabase.from("profiles").update({ status_manual: value }).eq("id", auth.user.id)
    toast.success("상태를 변경했어요.")
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
            <input className={fieldClass} value={position} onChange={(e) => setPosition(e.target.value)} placeholder="예: 팀장 / 매니저 / 사원" />
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

      {/* 화면(테마) */}
      <Card>
        <SectionTitle title="화면" desc="밝기 테마를 선택해요." />
        <Segmented
          block
          options={THEMES}
          value={mounted ? resolvedTheme ?? "dark" : ""}
          onChange={(v) => setTheme(v)}
        />
      </Card>

      {/* 워크스페이스 */}
      <Card>
        <SectionTitle title="워크스페이스" desc="현재 소속된 워크스페이스예요." />
        <div className="overflow-hidden rounded-xl border text-sm">
          <div className="flex items-center justify-between border-b px-3.5 py-2.5">
            <span className="text-muted-foreground">이름</span>
            <span className="font-medium">이큐리아 워크스페이스</span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-muted-foreground">로그인 계정</span>
            <span className="font-medium">{name || email}</span>
          </div>
        </div>
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
