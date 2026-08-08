"use client"

// 서비스워커 등록 — PWA "설치" 요건(활성 SW + fetch 핸들러)을 만족시키는 유일한 목적.
// 캐시 정책은 public/sw.js 에 있고, 사용자 데이터는 캐시하지 않는다.
import { useEffect } from "react"

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    // 개발 중에는 등록하지 않는다 — HMR 자산을 잡고 있으면 변경이 안 보여 디버깅이 꼬인다.
    if (process.env.NODE_ENV !== "production") return

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* 등록 실패는 무음 — 앱은 SW 없이도 완전히 동작한다(설치만 안 될 뿐) */
      })
    }
    // 초기 로딩 경로를 뺏지 않도록 load 이후에 등록.
    if (document.readyState === "complete") onLoad()
    else window.addEventListener("load", onLoad, { once: true })
    return () => window.removeEventListener("load", onLoad)
  }, [])

  return null
}
