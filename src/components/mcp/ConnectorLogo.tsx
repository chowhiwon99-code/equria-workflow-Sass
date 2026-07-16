"use client"

import { useState } from "react"

/** 커넥터 로고 — 도메인 파비콘(64px). 실패 시 emoji 폴백. McpView·위저드 MCP 스텝 공용. */
export function ConnectorLogo({
  domain,
  emoji,
  imgClass = "size-6",
  emojiClass = "text-lg",
}: {
  domain?: string
  emoji: string
  imgClass?: string
  emojiClass?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!domain || failed) return <span className={emojiClass}>{emoji}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
      alt=""
      className={imgClass}
      onError={() => setFailed(true)}
    />
  )
}
