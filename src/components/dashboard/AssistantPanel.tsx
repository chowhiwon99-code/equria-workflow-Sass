"use client"

import { useEffect, useState } from "react"
import { Surface } from "@/components/shared/Surface"
import { DashboardAssistant } from "./DashboardAssistant"

/**
 * 어시스턴트 패널 — 상단 경계에 커서를 대고 드래그하면 높이 조절(세션41 대표 요청·기기별 기억).
 * 손익 캔버스와 같은 보이지 않는 경계 패턴.
 */
export function AssistantPanel() {
  const [h, setH] = useState(416) // 26rem
  useEffect(() => {
    const saved = Number(localStorage.getItem("equria:assistant-h"))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 저장 높이 복원(SSR 416과 하이드레이션 정합)
    if (saved >= 240 && saved <= 1200) setH(saved)
  }, [])
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = h
    const clamp = (n: number) => Math.min(1200, Math.max(240, n))
    // 위 경계라 위로 끌면 커진다(위 카드 영역을 잠식)
    const onMove = (ev: PointerEvent) => setH(clamp(startH - (ev.clientY - startY)))
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      localStorage.setItem("equria:assistant-h", String(clamp(startH - (ev.clientY - startY))))
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }
  return (
    <>
      <div onPointerDown={startResize} className="-my-1.5 h-4 shrink-0 cursor-ns-resize touch-none" title="드래그해서 AI 채팅 높이 조절" />
      <Surface padding="none" className="shrink-0 overflow-hidden rounded-xl" style={{ height: h }}>
        <DashboardAssistant />
      </Surface>
    </>
  )
}
