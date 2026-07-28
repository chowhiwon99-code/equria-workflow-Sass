"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Settings, Mail, LogOut, Plus } from "lucide-react"
import { useWorkspace } from "@/components/workspace/WorkspaceProvider"
import { createClient } from "@/lib/supabase/client"
import { writeActiveWsCookie, clearActiveWsCookie } from "@/lib/workspace-cookie"
import { cn } from "@/lib/utils"

const ROLE_LABEL: Record<string, string> = { owner: "관리자", admin: "관리자", member: "멤버", guest: "게스트" }

/** 워크스페이스(회사) 이니셜 아바타 — 첫 글자. */
function WsAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("flex items-center justify-center rounded-md bg-foreground/10 font-semibold", className)}>
      {name.trim().slice(0, 1) || "W"}
    </span>
  )
}

/**
 * 사이드바 상단 워크스페이스 전환기(노션식 풀 패널) — 현재 회사 + 드롭다운.
 * 클릭하면: 현재 회사 헤더 → 설정·멤버 초대 → 계정 이메일 → 워크스페이스 목록(정식 멤버십만·체크)
 * → 새 워크스페이스 만들기 → 로그아웃. 전환 = 활성 워크스페이스 쿠키 세팅 후 새로고침(RLS 스코프 재적용).
 */
export function WorkspaceSwitcher() {
  const { currentWorkspace, workspaces, currentWorkspaceId } = useWorkspace()
  const router = useRouter()
  // createClient()는 렌더마다 새 인스턴스 → useState 초기화로 1회만(이펙트 deps 안정화).
  const [supabase] = useState(() => createClient())
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || email) return
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
  }, [open, email, supabase])

  // 전환기에는 정식 멤버십(비게스트)만 노출 — 게스트 워크스페이스는 활성 스코프가 될 수 없어(마이그119
  // 헬퍼가 게스트 제외) 클릭해도 동작 안 함. 게스트로 초대된 프로젝트는 /projects에서 접근(전환 불필요).
  const switchable = workspaces.filter((w) => w.role !== "guest")

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onEsc)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onEsc)
    }
  }, [open])

  if (!currentWorkspace) return null

  const switchTo = (id: string) => {
    setOpen(false)
    if (id === currentWorkspaceId) return
    writeActiveWsCookie(id)
    window.location.assign("/dashboard") // 활성 회사 변경 → 전 화면 RLS 스코프 재적용
  }

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const signOut = async () => {
    setOpen(false)
    clearActiveWsCookie() // 공용 PC에서 다음 사용자에게 활성 스코프 잔존 방지
    await supabase.auth.signOut()
    window.location.assign("/login")
  }

  return (
    <div ref={ref} className="relative border-b px-2 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <WsAvatar name={currentWorkspace.name} className="size-7 shrink-0 text-xs" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-pretendard text-sm font-semibold">{currentWorkspace.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {ROLE_LABEL[currentWorkspace.role] ?? "멤버"}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full z-30 mt-1 overflow-hidden rounded-xl border bg-popover py-1 shadow-lg">
          {/* 현재 회사 헤더 */}
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <WsAvatar name={currentWorkspace.name} className="size-9 shrink-0 rounded-lg text-sm" />
            <span className="min-w-0">
              <span className="block truncate font-pretendard text-sm font-semibold">{currentWorkspace.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {ROLE_LABEL[currentWorkspace.role] ?? "멤버"}
              </span>
            </span>
          </div>

          {/* 액션 */}
          <div className="border-t py-1">
            <button type="button" onClick={() => go("/settings")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted">
              <Settings className="size-4 text-muted-foreground" /> 설정
            </button>
            {currentWorkspace.role !== "guest" && (
              <button type="button" onClick={() => go("/settings")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted">
                <Mail className="size-4 text-muted-foreground" /> 멤버 초대
              </button>
            )}
          </div>

          {/* 계정 이메일 + 워크스페이스 목록 */}
          <div className="border-t py-1">
            {email && <p className="truncate px-3 py-1.5 text-[11px] text-muted-foreground">{email}</p>}
            {switchable.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => switchTo(w.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <WsAvatar name={w.name} className="size-6 shrink-0 rounded text-[11px]" />
                <span className="min-w-0 flex-1 truncate font-pretendard">{w.name}</span>
                {w.id === currentWorkspaceId && <Check className="size-4 shrink-0 text-foreground" />}
              </button>
            ))}
            <button type="button" onClick={() => go("/onboarding?new=1")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted">
              <Plus className="size-4" /> 새 워크스페이스 만들기
            </button>
          </div>

          {/* 로그아웃 */}
          <div className="border-t py-1">
            <button type="button" onClick={signOut} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted">
              <LogOut className="size-4 text-muted-foreground" /> 로그아웃
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
