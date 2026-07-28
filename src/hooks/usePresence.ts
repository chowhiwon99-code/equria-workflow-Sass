"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"

/**
 * 워크스페이스 전체 온라인 사용자 id 집합 — Supabase Realtime Presence.
 * 로그인하면 자동 track, presenceState로 온라인 집합 계산. unmount 시 채널 해제.
 * (온/오프는 휘발성이라 DB에 쓰지 않음 — 수동상태만 profiles.status_manual.)
 * B1-b: presence는 RLS 필터가 없어 채널명을 워크스페이스별로 분리(회사 간 온라인 상태 격리).
 */
export function useOnlineUsers(meId: string | null): Set<string> {
  const wsId = useCurrentWorkspaceId()
  const [online, setOnline] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!meId || !wsId) return
    const supabase = createClient()
    const channel = supabase.channel(`presence-workspace-${wsId}`, { config: { presence: { key: meId } } })
    channel
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())))
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ at: Date.now() })
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [meId, wsId])

  return online
}
