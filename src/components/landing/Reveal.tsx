"use client"

import { useEffect, useRef, useState } from "react"

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
  // reduced-motion이면 초기 렌더부터 바로 보이게(지연 초기값 — effect 안에서 동기 setState 안 함)
  const [visible, setVisible] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )

  useEffect(() => {
    if (visible) return
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
  }, [visible])

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement & HTMLSpanElement>}
      className={`transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  )
}
