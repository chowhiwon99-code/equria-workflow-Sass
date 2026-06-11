"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Notification } from "@/types"

export function NotificationBell({ userId }: { userId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [items, setItems] = useState<Notification[]>([])
  const [menuOpen, setMenuOpen] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20)
    setItems(data ?? [])
  }, [supabase, userId])

  useEffect(() => {
    load()
    // 실시간 구독: 본인 알림의 INSERT(새 알림)·UPDATE(읽음처리)·DELETE 모두 반영
    //  → 채팅방 입장 시 mark_dm_read가 알림을 읽음처리하면 종(배지)이 즉시 갱신됨
    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, userId, load])

  const unread = items.filter((n) => !n.is_read).length

  // 클릭 = 즉시 닫고 이동(이동을 DB 쓰기에 막지 않음). 읽음 처리는 낙관적 + 백그라운드.
  const open = (n: Notification) => {
    setMenuOpen(false)
    if (n.link) router.push(n.link)
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      void supabase.from("notifications").update({ is_read: true }).eq("id", n.id)
    }
  }

  const markAllRead = async () => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false)
    // 쓰기 성공 시에만 낙관적 클리어 — supabase-js는 실패해도 throw 안 하므로 배지가 거짓 해제되지 않도록
    if (!error) setItems((prev) => prev.map((x) => ({ ...x, is_read: true })))
  }

  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(o) => {
        setMenuOpen(o)
        // 알림을 열면(벨 누르면) 모두 확인(읽음) 처리 — 배지 즉시 클리어
        if (o && unread > 0) void markAllRead()
      }}
    >
      <DropdownMenuTrigger className="relative flex size-8 items-center justify-center rounded-md transition-colors hover:bg-accent">
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">알림</span>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-muted-foreground hover:underline">
              모두 읽음
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">알림이 없습니다.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => open(n)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 border-b px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/50",
                  !n.is_read && "bg-primary/5"
                )}
              >
                <div className="flex w-full items-center gap-2">
                  {!n.is_read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className="flex-1 truncate text-sm font-medium">{n.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                  </span>
                </div>
                {n.body && <span className="line-clamp-1 pl-3.5 text-xs text-muted-foreground">{n.body}</span>}
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
