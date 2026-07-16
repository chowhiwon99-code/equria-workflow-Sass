"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Check, ExternalLink, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { MCP_CONNECTORS } from "@/lib/mcp"
import { ConnectorLogo } from "@/components/mcp/ConnectorLogo"

// 위저드 'MCP 연결' 스텝. 연결한 것 = 선택(바인딩), 안 한 것 = "연결하면 쓸 수 있는 도구"로 펼쳐 보여주고
// 개인 계정이 필요한 건 먼저 /mcp에서 연결하도록 안내. (연결 OAuth는 위저드 밖 /mcp에서 진행)
const AVAILABLE = MCP_CONNECTORS.filter((c) => c.status === "available")

export function McpConnectorPicker({
  value,
  onToggle,
}: {
  value: string[]
  onToggle: (id: string) => void
}) {
  const [connectedIds, setConnectedIds] = useState<string[] | null>(null)
  const [showMore, setShowMore] = useState(false)

  useEffect(() => {
    let alive = true
    fetch("/api/mcp/user-connections")
      .then((r) => (r.ok ? r.json() : { connections: [] }))
      .then((j: { connections?: { connector_id: string }[] }) => {
        if (alive) setConnectedIds((j.connections ?? []).map((c) => c.connector_id))
      })
      .catch(() => {
        if (alive) setConnectedIds([])
      })
    return () => {
      alive = false
    }
  }, [])

  const connected = connectedIds === null ? [] : AVAILABLE.filter((c) => connectedIds.includes(c.id))
  const notConnected = connectedIds === null ? [] : AVAILABLE.filter((c) => !connectedIds.includes(c.id))

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* 연결된 도구 = 선택하면 이 에이전트가 사용 */}
      {connectedIds === null ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : connected.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          아직 연결한 도구가 없어요. 아래에서 연결하면 이 에이전트가 쓸 수 있어요.
        </p>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {connected.map((c) => {
            const on = value.includes(c.id)
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => onToggle(c.id)}
                title={c.description}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                )}
              >
                <ConnectorLogo domain={c.domain} emoji={c.emoji} imgClass="size-4" emojiClass="text-base" />
                {c.name}
                {on && <Check className="size-3.5" />}
              </button>
            )
          })}
        </div>
      )}

      {/* 연결하면 쓸 수 있는 도구 — 클릭하면 밑으로 펼쳐짐 */}
      {notConnected.length > 0 && (
        <div className="w-full">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="mx-auto flex w-fit items-center gap-1 text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            <Plus className="size-3.5" /> 연결하면 쓸 수 있는 도구 {notConnected.length}개 {showMore ? "접기" : "보기"}
          </button>
          {showMore && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-center text-[11px] text-muted-foreground">
                개인 계정이 필요한 도구(Notion 등)는 눌러서 <b>먼저 연결</b>한 뒤, 이 스텝에서 선택하세요.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {notConnected.map((c) => {
                  const needsAccount = c.preset?.auth !== "none"
                  return (
                    <Link
                      key={c.id}
                      href="/mcp"
                      target="_blank"
                      title={c.description}
                      className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground opacity-70 transition-all hover:bg-muted hover:opacity-100"
                    >
                      <ConnectorLogo domain={c.domain} emoji={c.emoji} imgClass="size-4" emojiClass="text-base" />
                      {c.name}
                      <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                        {needsAccount ? "계정 연결 필요" : "연결 필요"}
                      </span>
                      <ExternalLink className="size-3" />
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
