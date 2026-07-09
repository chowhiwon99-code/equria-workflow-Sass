"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * 뷰포트 미디어쿼리 구독 — display:none(숨김)과 달리 컴포넌트를 아예 마운트하지 않을 때 사용.
 * SSR/하이드레이션 첫 렌더는 false(모바일 우선) → 클라이언트에서 실제 값으로 갱신.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query]
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
