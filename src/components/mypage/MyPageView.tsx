"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Loading, ErrorState } from "@/components/shared/States"
import { renderAgentIcon } from "@/components/agents/AgentIcon"
import { formatUsd } from "@/lib/pricing"

type Profile = { name: string; department: string | null; role: string }
type AgentLite = { id: string; name: string; description: string | null; icon: string }
type Stats = { calls: number; tokensIn: number; tokensOut: number; agentsUsed: number; cost: number }

export function MyPageView() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [myAgents, setMyAgents] = useState<AgentLite[]>([])
  const [stats, setStats] = useState<Stats>({ calls: 0, tokensIn: 0, tokensOut: 0, agentsUsed: 0, cost: 0 })

  const load = useCallback(async () => {
    setError(null)
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        setLoading(false)
        return
      }
      const me = auth.user.id
      const [{ data: prof }, { data: agents }, { data: usage }] = await Promise.all([
        supabase.from("profiles").select("name, department, role").eq("id", me).single(),
        supabase
          .from("agents")
          .select("id, name, description, icon")
          .eq("created_by", me)
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
        supabase.from("agent_usage").select("agent_id, tokens_input, tokens_output, cost_usd").eq("user_id", me),
      ])
      if (prof) setProfile(prof as Profile)
      setMyAgents((agents as AgentLite[]) ?? [])
      const rows = usage ?? []
      setStats({
        calls: rows.length,
        tokensIn: rows.reduce((s, r) => s + (r.tokens_input ?? 0), 0),
        tokensOut: rows.reduce((s, r) => s + (r.tokens_output ?? 0), 0),
        cost: rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0),
        agentsUsed: new Set(rows.map((r) => r.agent_id).filter(Boolean)).size,
      })
    } catch {
      setError("마이페이지 정보를 불러오지 못했어요.")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Loading rows={5} />
  if (error)
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setError(null)
          load()
        }}
      />
    )

  const fmt = (n: number) => n.toLocaleString("ko-KR")
  const tiles = [
    { label: "AI 호출", value: fmt(stats.calls) },
    { label: "추정 비용", value: formatUsd(stats.cost) },
    { label: "입력 토큰", value: fmt(stats.tokensIn) },
    { label: "출력 토큰", value: fmt(stats.tokensOut) },
    { label: "사용한 에이전트", value: fmt(stats.agentsUsed) },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* 프로필 카드 */}
      <div className="flex items-center gap-4 rounded-xl border p-5">
        <Avatar className="size-14">
          <AvatarFallback className="text-lg">{(profile?.name ?? "직원").slice(0, 2)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">{profile?.name ?? "직원"}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {profile?.role === "admin" ? "관리자" : "멤버"}
            </span>
          </div>
          <span className="text-sm text-muted-foreground">{profile?.department || "부서 미설정"}</span>
        </div>
        <Link href="/settings" className="ml-auto text-xs text-muted-foreground hover:text-foreground">
          프로필 수정 →
        </Link>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-1 rounded-xl border p-4">
            <span className="text-xs text-muted-foreground">{t.label}</span>
            <span className="text-xl font-semibold tabular-nums">{t.value}</span>
          </div>
        ))}
      </div>

      {/* 내 에이전트 */}
      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">내 에이전트</h2>
        {myAgents.length === 0 ? (
          <Link
            href="/agents/new"
            className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground hover:bg-muted/50"
          >
            아직 만든 에이전트가 없어요. 새 에이전트 만들기 →
          </Link>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myAgents.map((a) => (
              <Link
                key={a.id}
                href={`/agents/${a.id}`}
                className="hover-grow flex flex-col gap-1 rounded-lg border p-4"
              >
                <span className="text-2xl">{renderAgentIcon(a.icon, "size-6")}</span>
                <span className="text-sm font-semibold">{a.name}</span>
                {a.description && (
                  <span className="line-clamp-2 text-xs text-muted-foreground">{a.description}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
