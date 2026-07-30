"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Surface } from "@/components/shared/Surface"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { AnnouncementsBoard } from "./AnnouncementsBoard"
import { TodayTasks } from "./TodayTasks"
import { TaskSuggestions } from "./TaskSuggestions"
import { WorkOverview } from "./WorkOverview"
import { DashboardAssistant } from "./DashboardAssistant"

/**
 * 대시보드 한 화면 배치(세션41 대표 요청 — "다 한눈에").
 * 데스크톱: 공지 → [좌: 오늘 할 일|작업 제안 + 진행/예정] | [우: AI 채팅 세로 풀] — 페이지 스크롤 없이 전부 보임.
 * 경계 드래그 = AI 채팅 폭 조절(기기별 기억). 모바일: 세로 스택 + AI 높이 드래그(위 경계).
 */
export function DashboardLayout() {
  const isDesktop = useMediaQuery("(min-width: 1024px)")
  const [aiW, setAiW] = useState(460) // 데스크톱 AI 컬럼 폭
  const [aiH, setAiH] = useState(416) // 모바일 AI 높이
  useEffect(() => {
    const w = Number(localStorage.getItem("equria:dashboard-ai-w"))
    const h = Number(localStorage.getItem("equria:assistant-h"))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 저장값 복원(SSR 기본값과 하이드레이션 정합)
    if (w >= 320 && w <= 900) setAiW(w)
    if (h >= 240 && h <= 1200) setAiH(h)
  }, [])

  const startWidthResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = aiW
    const clamp = (n: number) => Math.min(900, Math.max(320, n))
    const onMove = (ev: PointerEvent) => setAiW(clamp(startW - (ev.clientX - startX)))
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      localStorage.setItem("equria:dashboard-ai-w", String(clamp(startW - (ev.clientX - startX))))
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp) // 리뷰 F5: cancel 시 리스너 정리(리사이즈는 값 커밋 무해)
  }
  const startHeightResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = aiH
    const clamp = (n: number) => Math.min(1200, Math.max(240, n))
    const onMove = (ev: PointerEvent) => setAiH(clamp(startH - (ev.clientY - startY)))
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      localStorage.setItem("equria:assistant-h", String(clamp(startH - (ev.clientY - startY))))
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp) // 리뷰 F5: cancel 시 리스너 정리(리사이즈는 값 커밋 무해)
  }

  return (
    <div className="flex min-h-[var(--app-content-height)] flex-col gap-3 lg:h-[var(--app-content-height)] lg:min-h-0">
      <AnnouncementsBoard />
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {/* 좌: 작업 카드들 — 카드 내부 스크롤, 페이지는 한 화면 유지.
            @container: AI 칸을 넓혀 좌측이 좁아지면 카드가 자동으로 세로 스택(뷰포트가 아니라 실제 남은 폭 기준 반응) */}
        <div className="@container flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="grid min-h-0 flex-1 gap-3 @2xl:grid-cols-2">
            <TodayTasks />
            <TaskSuggestions />
          </div>
          <WorkOverview />
        </div>

        {/* 경계 핸들만 분기, 어시스턴트는 단일 렌더(리뷰 F2 — 브레이크포인트 통과 시 리마운트로 채팅 상태 소실 방지) */}
        {isDesktop ? (
          <div onPointerDown={startWidthResize} className="-mx-1 w-2 shrink-0 cursor-ew-resize touch-none" title="드래그해서 AI 채팅 폭 조절" />
        ) : (
          <div onPointerDown={startHeightResize} className="-my-1.5 h-4 shrink-0 cursor-ns-resize touch-none" title="드래그해서 AI 채팅 높이 조절" />
        )}
        <Surface
          padding="none"
          className={cn("shrink-0 overflow-hidden rounded-xl", isDesktop && "min-h-0 max-w-[50%]")}
          style={isDesktop ? { width: aiW } : { height: aiH }}
        >
          <DashboardAssistant />
        </Surface>
      </div>
    </div>
  )
}
