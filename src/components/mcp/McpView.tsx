"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { MCP_CONNECTORS } from "@/lib/mcp"

type ServerRow = { id: string; name: string; type: string; is_active: boolean }

export function McpView() {
  const supabase = createClient()
  const [isAdmin, setIsAdmin] = useState(false)
  const [servers, setServers] = useState<ServerRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        setLoading(false)
        return
      }
      const [{ data: prof }, { data: srv }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", auth.user.id).single(),
        supabase
          .from("mcp_servers")
          .select("id, name, type, is_active")
          .order("created_at", { ascending: true }),
      ])
      setIsAdmin(prof?.role === "admin")
      setServers((srv as ServerRow[]) ?? [])
      setLoading(false)
    })()
  }, [supabase])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">MCP 연결</h1>
        <p className="text-sm text-muted-foreground">
          외부 도구를 큐레이션 카탈로그로 연결합니다. (연결 런타임 준비 중)
        </p>
      </div>

      {/* 커넥터 카탈로그 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MCP_CONNECTORS.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border p-4">
            <span className="text-2xl">{c.emoji}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{c.name}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {c.status === "available" ? "사용 가능" : "준비 중"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{c.description}</p>
            </div>
            <Button size="sm" variant="outline" disabled>
              연결 (곧)
            </Button>
          </div>
        ))}
      </div>

      {/* 관리자: 등록된 MCP 서버 (읽기) */}
      {isAdmin && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-medium text-muted-foreground">등록된 MCP 서버 (관리자 전용)</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : servers.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
              등록된 서버가 없어요.
            </p>
          ) : (
            <div className="flex flex-col divide-y rounded-xl border">
              {servers.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex-1 font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.type}</span>
                  <span
                    className={
                      s.is_active ? "text-[11px] text-green-600" : "text-[11px] text-muted-foreground"
                    }
                  >
                    {s.is_active ? "활성" : "비활성"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
