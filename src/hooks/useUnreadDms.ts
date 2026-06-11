"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onChat } from "@/lib/chatBus"

/**
 * 내 미읽음 DM 총개수 — 사이드바 "직원 채팅" 빨간 배지용.
 * RLS가 내 대화방 메시지로 한정하므로, '상대가 보냄 · 안읽음 · 미삭제'만 세면 된다.
 * 새 메시지(INSERT)·읽음 처리(UPDATE=read_at) 시 실시간으로 갱신(ChatList와 동일 구독 패턴).
 */
export function useUnreadDms(): number {
  const supabase = createClient()
  const [count, setCount] = useState(0)
  const [meId, setMeId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    const me = auth.user?.id
    if (!me) {
      // 세션 상실 시 배지/구독 정리(방어적 — 현 라우팅상 보통 언마운트됨)
      setMeId(null)
      setCount(0)
      return
    }
    setMeId(me)
    const { count } = await supabase
      .from("direct_messages")
      .select("id", { count: "exact", head: true })
      .neq("sender_id", me)
      .is("read_at", null)
      .is("deleted_at", null)
    setCount(count ?? 0)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    if (!meId) return
    const channel = supabase
      .channel("dm-unread-sidebar")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "direct_messages" }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, meId, load])

  // 다른 창/탭의 채팅 변경 즉시 반영(BroadcastChannel)
  useEffect(() => onChat(() => load()), [load])

  return count
}
