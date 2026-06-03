"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { MANUAL_STATUSES } from "@/components/chat/StatusDot"

const THEMES = [
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
  { value: "system", label: "시스템" },
]

// 구성원 디렉터리에서 항목별 공개 여부 (directory_contact RPC가 이 정책으로 게이팅)
const PRIVACY_FIELDS = [
  { key: "email", label: "이메일" },
  { key: "work_phone", label: "사내 전화" },
  { key: "mobile", label: "휴대폰" },
] as const

type ContactVisibility = "all" | "private"
type ContactPrivacy = Record<(typeof PRIVACY_FIELDS)[number]["key"], ContactVisibility>

export function SettingsView() {
  const supabase = createClient()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
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
    setLoading(false)
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

  if (loading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {/* 프로필 */}
      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">프로필</h2>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">이름</span>
          <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">부서</span>
          <input
            className={fieldClass}
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="예: 마케팅팀"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">직급</span>
          <input
            className={fieldClass}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="예: 팀장 / 매니저 / 사원"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted-foreground">사내 전화</span>
            <input
              className={fieldClass}
              value={workPhone}
              onChange={(e) => setWorkPhone(e.target.value)}
              placeholder="예: 02-000-0000"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted-foreground">휴대폰</span>
            <input
              className={fieldClass}
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="예: 010-0000-0000"
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">역할: {role === "admin" ? "관리자" : "멤버"}</p>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">상태 (다른 직원에게 표시)</span>
          <div className="flex flex-wrap gap-1.5">
            {MANUAL_STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setMyStatus(s.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                  (status ?? "active") === s.value ? "border-primary bg-primary/10" : "hover:bg-muted"
                )}
              >
                <span className={cn("size-2 rounded-full", s.color)} />
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">연락처 공개 범위 (구성원 디렉터리에서 다른 직원에게)</span>
          {PRIVACY_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span>{f.label}</span>
              <div className="flex gap-1">
                {(["all", "private"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPrivacy((p) => ({ ...p, [f.key]: v }))}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs transition-colors",
                      privacy[f.key] === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    )}
                  >
                    {v === "all" ? "공개" : "비공개"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={saveProfile} disabled={!name.trim() || saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </section>

      {/* 화면(테마) */}
      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">화면</h2>
        <span className="text-xs text-muted-foreground">테마</span>
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTheme(t.value)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                mounted && theme === t.value ? "border-primary bg-primary/10" : "hover:bg-muted"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* 워크스페이스 */}
      <section className="flex flex-col gap-2 rounded-xl border p-4 text-sm">
        <h2 className="text-sm font-semibold">워크스페이스</h2>
        <div className="flex justify-between text-muted-foreground">
          <span>이름</span>
          <span>이큐리아 워크스페이스</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>로그인 계정</span>
          <span>{name || email}</span>
        </div>
      </section>

      {/* 계정 */}
      <section className="flex items-center justify-between rounded-xl border p-4">
        <div>
          <h2 className="text-sm font-semibold">계정</h2>
          <p className="text-xs text-muted-foreground">이 기기에서 로그아웃합니다.</p>
        </div>
        <Button size="sm" variant="outline" onClick={logout}>
          로그아웃
        </Button>
      </section>
    </div>
  )
}
