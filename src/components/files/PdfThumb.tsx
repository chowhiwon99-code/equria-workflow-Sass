"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import { FILES_BUCKET } from "@/lib/files"

const supabase = createClient()
const cache = new Map<string, string>() // 파일 id → 1페이지 썸네일 dataURL(세션 캐시)

/**
 * PDF 1페이지를 아이콘뷰 타일용 썸네일로 렌더.
 * - 뷰포트 진입 시에만(lazy) pdfjs-dist를 동적 로드 → 첫 페이지 캔버스 렌더.
 * - 워커는 jsdelivr CDN(설치 버전 정확 매칭) — 번들러 워커 설정을 피해 빌드 안전.
 * - 실패/로딩 중에는 호출부가 준 fallback(종류 아이콘)으로 표시(라이브 무영향·크기 적응).
 */
export function PdfThumb({
  id,
  path,
  className,
  fallback,
}: {
  id: string
  path: string
  className?: string
  fallback: ReactNode
}) {
  const [src, setSrc] = useState<string | null>(() => cache.get(id) ?? null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (src) return
    const el = ref.current
    if (!el) return
    let cancelled = false
    const io = new IntersectionObserver(async (entries) => {
      if (!entries[0]?.isIntersecting) return
      io.disconnect()
      try {
        const { data } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(path, 120)
        const url = data?.signedUrl
        if (!url || cancelled) return
        const pdfjs = await import("pdfjs-dist")
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
        const loadingTask = pdfjs.getDocument({ url })
        const doc = await loadingTask.promise
        const page = await doc.getPage(1)
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: Math.min(2, 240 / base.width) })
        const canvas = document.createElement("canvas")
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        await page.render({ canvas, canvasContext: ctx, viewport }).promise
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8)
        cache.set(id, dataUrl)
        await loadingTask.destroy()
        if (!cancelled) setSrc(dataUrl)
      } catch {
        // 실패 → 아이콘 폴백(아무 동작 안 함)
      }
    })
    io.observe(el)
    return () => {
      cancelled = true
      io.disconnect()
    }
  }, [id, path, src])

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={className} />
  }
  return (
    <div ref={ref} className="flex size-full items-center justify-center">
      {fallback}
    </div>
  )
}
