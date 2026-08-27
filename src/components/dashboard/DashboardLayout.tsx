"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Surface } from "@/components/shared/Surface"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { GettingStartedCard } from "./GettingStartedCard"
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
      {/* 골든패스 안내 — 3단계를 다 하거나 닫으면 스스로 사라진다(그 뒤엔 자리도 차지하지 않음) */}
      <GettingStartedCard />
      <AnnouncementsBoard />
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {/* 좌: 작업 카드들 — 카드 내부 스크롤, 페이지는 한 화면 유지.
            @container: AI 칸을 넓혀 좌측이 좁아지면 카드가 자동으로 세로 스택(뷰포트가 아니라 실제 남은 폭 기준 반응)
            ⚠️ overflow-y-auto 필수 — 없으면(2026-08-26 발견) lg: 고정높이(var(--app-content-height))인데
            좌측이 세로 스택(@2xl 미만)될 때, 카드들이 눌려도 Surface/EmptyState가 clip을 안 해서
            내용이 다음 카드 뒤로 겹쳐 보인다. min-h-0만으론 "안 눌리고 스크롤됨"이 보장 안 됨. */}
        <div className="@container flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
          {/* min-h — Playwright로 재현·수정 확인(2026-08-26): TodayTasks/TaskSuggestions 카드 자체에
              overflow-y-auto를 걸어 겹침은 없앴지만(각 카드 파일), flex-1이 이 그리드를 한도 없이
              누를 수 있어 최소한(제목+입력줄)도 못 담을 만큼 눌리면 카드가 스크롤된 채로 시작해
              입력창 윗부분이 잘린 것처럼 보였다. 최소 높이를 줘서 그 밑으로는 안 눌리게 하고,
              그래도 화면이 부족하면 위 overflow-y-auto가 전체 좌측 컬럼을 스크롤시킨다. */}
          <div className="grid min-h-[260px] flex-1 gap-3 @2xl:grid-cols-2">
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
