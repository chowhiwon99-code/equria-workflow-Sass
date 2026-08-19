"use client"

// 좌석(시트) 현황 — 요금제 정원과 현재 비게스트 멤버 수.
// 초대 링크 카드·사이드바 '팀 초대'·시작하기 카드가 같은 숫자를 봐야 해서 한 곳으로 모았다.
// (게스트는 좌석을 쓰지 않는다 — InviteLinksCard의 기존 계산과 동일한 정의.)

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"

export type Seats = {
  plan: string
  /** 비게스트 멤버 수(오너 포함). 아직 못 불러왔으면 0. */
  used: number
  loading: boolean
  reload: () => void
}

export function useSeats(): Seats {
  const supabase = createClient()
  const wsId = useCurrentWorkspaceId()
  const [plan, setPlan] = useState("free")
  const [used, setUsed] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!wsId) return
    const [{ data: ws }, { count }] = await Promise.all([
      supabase.from("workspaces").select("plan").eq("id", wsId).maybeSingle(),
      supabase
        .from("workspace_members")
        .select("user_id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .neq("role", "guest"),
    ])
    setPlan(ws?.plan ?? "free")
    setUsed(count ?? 0)
    setLoading(false)
  }, [supabase, wsId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 좌석 현황 로드
    void load()
  }, [load])

  return { plan, used, loading, reload: load }
}
