"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { useWorkspace } from "@/components/workspace/WorkspaceProvider"
import { writeActiveWsCookie } from "@/lib/workspace-cookie"
import { cn } from "@/lib/utils"

/** 워크스페이스(회사) 이니셜 아바타 — 첫 글자. */
function WsAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground/10 text-xs font-semibold", className)}>
      {name.trim().slice(0, 1) || "W"}
    </span>
  )
}

/**
 * 사이드바 상단 워크스페이스 전환기(노션식) — 현재 회사 이름 표시 + 드롭다운으로 전환.
 * 전환 = 활성 워크스페이스 쿠키 세팅 후 새로고침(서버/클라 Supabase가 x-workspace-id 헤더로 읽기 스코프).
 * 멤버십이 1개뿐이면 전환 목록 없이 회사 이름만(드롭다운 비활성).
 */
export function WorkspaceSwitcher() {
  const { currentWorkspace, workspaces, currentWorkspaceId } = useWorkspace()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
  const multi = workspaces.length > 1

  const switchTo = (id: string) => {
    setOpen(false)
    if (id === currentWorkspaceId) return
    writeActiveWsCookie(id)
    // 활성 워크스페이스가 바뀌면 전 화면 데이터가 달라지므로 완전 새로고침(RLS 스코프 재적용)
    window.location.assign("/dashboard")
  }

  return (
    <div ref={ref} className="relative border-b px-2 py-2">
      <button
        type="button"
        onClick={() => multi && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
          multi ? "hover:bg-muted" : "cursor-default"
        )}
        aria-haspopup={multi}
        aria-expanded={open}
      >
        <WsAvatar name={currentWorkspace.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{currentWorkspace.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {currentWorkspace.role === "owner" ? "관리자" : currentWorkspace.role === "guest" ? "게스트" : "멤버"}
          </span>
        </span>
        {multi && <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />}
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg">
          <p className="px-3 py-2 text-[11px] text-muted-foreground">내 워크스페이스</p>
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => switchTo(w.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
            >
              <WsAvatar name={w.name} className="size-6 rounded" />
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.id === currentWorkspaceId && <Check className="size-4 shrink-0 text-foreground" />}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              router.push("/onboarding?new=1")
            }}
            className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            <Plus className="size-4" /> 새 워크스페이스 만들기
          </button>
        </div>
      )}
    </div>
  )
}
