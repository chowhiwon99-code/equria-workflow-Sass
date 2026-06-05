"use client"

import { usePathname, useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { findFeatureByPath } from "@/lib/config/features"
import { NotificationBell } from "@/components/layout/NotificationBell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function Header({ userName, userId }: { userName: string; userId: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const feature = findFeatureByPath(pathname)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="flex h-[var(--header-height)] shrink-0 items-center justify-between border-b px-6">
      <h1 className="text-sm font-semibold">{feature?.label ?? "이큐리아 워크스페이스"}</h1>

      <div className="flex items-center gap-1">
        <NotificationBell userId={userId} />
        {/* 이름 클릭 → 마이페이지 직행 */}
        <button
          onClick={() => router.push("/mypage")}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
        >
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{userName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <span>{userName}</span>
        </button>
        {/* 설정·로그아웃은 옆 작은 메뉴 */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="계정 메뉴"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronDown className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => router.push("/mypage")}>마이페이지</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")}>설정</DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>로그아웃</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
