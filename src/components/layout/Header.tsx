"use client"

import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { findFeatureByPath } from "@/lib/config/features"
import { NotificationBell } from "@/components/layout/NotificationBell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
      <h1 className="text-sm font-semibold">{feature?.label ?? "이큐리아 워크스페이스"}</h1>

      <div className="flex items-center gap-1">
        <NotificationBell userId={userId} />
        <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">
              {userName.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <span>{userName}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{userName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/mypage")}>
            마이페이지
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            설정
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleLogout}>로그아웃</DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
