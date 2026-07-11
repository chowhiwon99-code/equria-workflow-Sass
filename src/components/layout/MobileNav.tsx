"use client"

import { useEffect, useState } from "react"
import { Menu } from "lucide-react"
import { Sidebar } from "@/components/layout/Sidebar"

/**
 * 모바일(<md) 전용 내비 — 햄버거 버튼 + 왼쪽 슬라이드인 드로어.
 * 데스크톱 사이드바(layout의 hidden md:flex)를 드로어로 재사용한다.
 * z-[60]: 앱 유일의 z-50 초과 레이어 — 드로어가 채팅 위젯(z-50)·모달 위를 덮는다(대표 확정).
 */
export function MobileNav() {
  const [open, setOpen] = useState(false)

  // ESC로 닫기 — 열려 있을 때만 리스너 부착
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        aria-expanded={open}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
      >
        <Menu className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* 스크림 — 바깥 탭으로 닫기. iOS: 드로어 글래스와 backdrop-filter가 중첩되면 렌더 버그 → 여긴 단순 딤만. */}
          <div
            className="absolute inset-0 bg-black/50 animate-in fade-in-0 duration-200"
            onClick={() => setOpen(false)}
          />
          {/* 드로어 패널 — 불투명 배경(bg-sidebar) 위에 사이드바. 링크 클릭 시 닫기.
              iOS Safari는 transform(slide-in)된 컨테이너 안의 backdrop-filter를 투명하게 렌더하는 버그가 있어,
              글래스 사이드바가 비쳐 보이던 문제를 solid 배경으로 원천 차단(Sidebar는 무수정 재사용). */}
          <div
            className="absolute inset-y-0 left-0 bg-sidebar shadow-xl animate-in slide-in-from-left duration-200"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a[href]")) setOpen(false)
            }}
          >
            <Sidebar />
          </div>
        </div>
      )}
    </>
  )
}
