"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useWorkspace } from "@/components/workspace/WorkspaceProvider"
import { FEATURES } from "@/lib/config/features"

const GUEST_PATHS = FEATURES.filter((f) => f.guestAllowed).map((f) => f.href)

/**
 * B2 게스트 게이팅(UX 계층) — 게스트가 비허용 경로에 들어오면 /projects로 보낸다.
 * 데이터 보안은 RLS(마이그 114)가 담당하므로 이 컴포넌트는 빈 화면 방지용.
 */
export function GuestGuard() {
  const { currentWorkspace } = useWorkspace()
  const pathname = usePathname()
  const router = useRouter()
  const isGuest = currentWorkspace?.role === "guest"
  const allowed = GUEST_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  useEffect(() => {
    if (isGuest && !allowed) router.replace("/projects")
  }, [isGuest, allowed, router])

  return null
}
