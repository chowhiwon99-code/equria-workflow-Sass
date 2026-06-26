"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { onChat } from "@/lib/chatBus"

/**
 * 내 미읽음 DM 총개수 — 사이드바 "직원 채팅" 빨간 배지용.
 * RLS가 내 대화방 메시지로 한정하므로, '상대가 보냄 · 안읽음 · 미삭제'만 세면 된다.
 * 사용자 id는 (app) 레이아웃이 주입한 컨텍스트에서 동기적으로 읽는다(클라 getUser 왕복 제거).
 * 새 메시지(INSERT)·읽음 처리(UPDATE=read_at) 시 실시간으로 갱신(ChatList와 동일 구독 패턴).
 */
export function useUnreadDms(): number {
  const supabase = createClient()
  const me = useCurrentUserId()
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    if (!me) {
      setCount(0)
      return
    }
    const { count } = await supabase
      .from("direct_messages")
      .select("id", { count: "exact", head: true })
      .neq("sender_id", me)
      .is("read_at", null)
      .is("deleted_at", null)
    setCount(count ?? 0)
  }, [supabase, me])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    if (!me) return
    const channel = supabase
      .channel("dm-unread-sidebar")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "direct_messages" }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, me, load])

  // 다른 창/탭의 채팅 변경 즉시 반영(BroadcastChannel)
  useEffect(() => onChat(() => load()), [load])

  return count
}
