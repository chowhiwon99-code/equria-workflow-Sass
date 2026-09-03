"use client"

import { useEffect, useRef, useState } from "react"
import { useMediaQuery } from "@/hooks/useMediaQuery"

/**
 * 스크롤 리빌 — IntersectionObserver로 실제 뷰포트 진입을 감지해 fade+살짝 올라오는 모션.
 * prefers-reduced-motion이면 애니메이션 없이 즉시 보인다.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  as?: "div" | "span"
}) {
  const ref = useRef<HTMLDivElement>(null)
  // useMediaQuery는 SSR/하이드레이션 첫 렌더에 항상 false를 반환(useSyncExternalStore)해
  // 서버·클라 첫 렌더 마크업이 일치한다 — window.matchMedia를 직접 읽으면 하이드레이션 불일치 발생
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const [visible, setVisible] = useState(false)
  // reducedMotion은 effect의 setState 없이 렌더에서 바로 합성 — useSyncExternalStore가
  // 값이 바뀌면 알아서 리렌더시켜주므로 effect가 따로 setVisible을 호출할 필요가 없다
  const shown = visible || reducedMotion

  useEffect(() => {
    if (shown) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown])

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement & HTMLSpanElement>}
      className={`transition-all duration-700 ease-out ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  )
}
