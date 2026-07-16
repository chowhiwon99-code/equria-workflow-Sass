"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Check, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { MCP_CONNECTORS } from "@/lib/mcp"

// 위저드 'MCP 연결' 스텝 — 내가 이미 연결한 개인 커넥터(Notion 등)를 골라 이 에이전트에 붙인다.
// 실제 연결(OAuth/토큰)은 /mcp에서 미리 하므로, 여기선 "연결된 것 중 선택 + 새로 연결하러 가기"만.
export function McpConnectorPicker({
  value,
  onToggle,
}: {
  value: string[]
  onToggle: (id: string) => void
}) {
  const [available, setAvailable] = useState<{ id: string; name: string }[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/mcp/user-connections")
      .then((r) => (r.ok ? r.json() : { connections: [] }))
      .then((j: { connections?: { connector_id: string }[] }) => {
        if (!alive) return
        setAvailable(
          (j.connections ?? []).map((c) => ({
            id: c.connector_id,
            name: MCP_CONNECTORS.find((m) => m.id === c.connector_id)?.name ?? c.connector_id,
          }))
        )
      })
      .catch(() => {
        if (alive) setAvailable([])
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-3">
      {available === null ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : available.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          아직 연결한 도구가 없어요.
          <br />
          아래 &quot;새로 연결&quot;에서 Notion 등을 연결하면 여기 나와요.
        </p>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {available.map((c) => {
            const on = value.includes(c.id)
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => onToggle(c.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                )}
              >
                {on && <Check className="size-3.5" />}
                {c.name}
              </button>
            )
          })}
        </div>
      )}
      <Link
        href="/mcp"
        target="_blank"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
      >
        <Plus className="size-3.5" /> 새로 연결하러 가기 (MCP)
      </Link>
    </div>
  )
}
