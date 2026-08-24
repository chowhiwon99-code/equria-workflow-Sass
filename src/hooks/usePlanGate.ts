"use client"

// 워크스페이스 요금제가 minPlan 이상인지 — 화면 게이팅(PlanGate)용. useSeats.ts와 같은 패턴(plan만 조회).
// ⚠️ 화면 안내용이다. 실제 강제는 각 테이블의 BEFORE INSERT 트리거(마이그143)가 한다.

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { meetsMinPlan, type PlanId } from "@/lib/plans"

export type PlanGateState = { plan: string; allowed: boolean; loading: boolean }

export function usePlanGate(minPlan: PlanId): PlanGateState {
  const supabase = createClient()
  const wsId = useCurrentWorkspaceId()
  const [plan, setPlan] = useState("free")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!wsId) return
    const { data } = await supabase.from("workspaces").select("plan").eq("id", wsId).maybeSingle()
    setPlan(data?.plan ?? "free")
    setLoading(false)
  }, [supabase, wsId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 플랜 조회
    void load()
  }, [load])

  return { plan, allowed: meetsMinPlan(plan, minPlan), loading }
}
