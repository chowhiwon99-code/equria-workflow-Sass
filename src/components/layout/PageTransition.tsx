"use client"

import { usePathname } from "next/navigation"

/**
 * 라우트 이동마다 콘텐츠를 부드럽게 페이드업 — key=pathname으로 진입 애니메이션을 재생.
 * equria-fade-up(backwards fill)이라 애니 종료 후 transform이 남지 않아 내부 position:fixed(모달·작성 도크)가 안전.
 * prefers-reduced-motion: reduce면 globals.css에서 animation 정지.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  )
}
