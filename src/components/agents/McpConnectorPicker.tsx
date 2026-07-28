"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Check, ExternalLink, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { MCP_CONNECTORS } from "@/lib/mcp"
import { ConnectorLogo } from "@/components/mcp/ConnectorLogo"

// 위저드 'MCP 연결' 스텝. 연결한 것 = 선택(바인딩).
// OAuth 커넥터는 위저드를 떠나지 않고 팝업으로 연결(콜백이 postMessage 후 자동 닫힘 → 목록 갱신·자동 선택).
// API 키 입력형(Exa 등)만 /mcp로 안내. (구 UX: 전부 /mcp 새 탭 → 위저드 이탈 — 대표 리포트로 개선 2026-07-28)
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

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/mcp/user-connections")
      const j = (r.ok ? await r.json() : { connections: [] }) as { connections?: { connector_id: string }[] }
      setConnectedIds((j.connections ?? []).map((c) => c.connector_id))
    } catch {
      setConnectedIds((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 연결 현황 로드
    void load()
  }, [load])

  useEffect(() => {
    // 팝업 연결 완료 신호 → 목록 갱신 + 방금 연결한 커넥터 자동 선택
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const d = e.data as { type?: string; ok?: boolean; connector?: string }
      if (d?.type !== "mcp-oauth") return
      void load()
      if (d.ok && d.connector && !value.includes(d.connector)) onToggle(d.connector)
    }
    // 팝업이 postMessage 없이 닫힌 경우 폴백 — 창 포커스 복귀 시 재조회
    const onFocus = () => void load()
    window.addEventListener("message", onMessage)
    window.addEventListener("focus", onFocus)
    return () => {
      window.removeEventListener("message", onMessage)
      window.removeEventListener("focus", onFocus)
    }
  }, [load, value, onToggle])

  const connectInPopup = (connectorId: string) => {
    window.open(
      `/api/mcp/oauth/${connectorId}/connect?popup=1`,
      "mcp-connect",
      "width=520,height=700,menubar=no,toolbar=no"
    )
  }

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
                누르면 <b>여기서 바로 연결</b>돼요(팝업). 연결이 끝나면 자동으로 선택됩니다.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {notConnected.map((c) => {
                  const isOAuth = c.preset?.auth === "oauth"
                  if (isOAuth) {
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => connectInPopup(c.id)}
                        title={c.description}
                        className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground opacity-70 transition-all hover:bg-muted hover:opacity-100"
                      >
                        <ConnectorLogo domain={c.domain} emoji={c.emoji} imgClass="size-4" emojiClass="text-base" />
                        {c.name}
                        <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">연결하기</span>
                      </button>
                    )
                  }
                  // API 키 입력형(Exa·GitHub 등)은 /mcp에서 키 등록이 필요
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
                      <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">API 키 필요</span>
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
