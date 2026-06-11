"use client"

import { useRef, useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"

/**
 * 호버 미리보기 — 트리거에 마우스를 올리면(300ms 후) 떠 있는 작은 미리보기를 띄운다.
 * 서명 URL은 getUrl()로 지연 로드 + 50초 캐시(만료 전 재호버는 재요청 안 함).
 * 이미지/PDF만 미리보기, 그 외 형식은 호버해도 뜨지 않음(클릭으로 전체보기).
 */
export function HoverPreview({
  getUrl,
  name,
  mime,
  children,
  className,
}: {
  getUrl: () => Promise<string | null>
  name: string
  mime?: string | null
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const timerRef = useRef<number | null>(null)
  const fetchedAtRef = useRef(0)
  const wrapRef = useRef<HTMLSpanElement>(null)

  const isImage = (mime?.startsWith("image/") ?? false) || /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(name)
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(name)
  const canPreview = isImage || isPdf

  const onEnter = () => {
    if (!canPreview) return
    timerRef.current = window.setTimeout(async () => {
      const r = wrapRef.current?.getBoundingClientRect()
      if (r) {
        const W = 320
        const H = 260
        const GAP = 10
        let left = r.right + GAP
        if (left + W > window.innerWidth - 8) left = r.left - W - GAP // 오른쪽 넘치면 왼쪽으로
        left = Math.max(8, left)
        const top = Math.max(8, Math.min(r.top, window.innerHeight - H - 8))
        setPos({ top, left })
      }
      setOpen(true)
      const now = Date.now()
      if (!url || now - fetchedAtRef.current > 50000) {
        const u = await getUrl()
        if (u) {
          setUrl(u)
          fetchedAtRef.current = now
        }
      }
    }, 300)
  }

  const onLeave = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setOpen(false)
  }

  return (
    <span ref={wrapRef} className={className} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {children}
      {open && pos && canPreview && (
        <div
          className="pointer-events-none fixed z-50 h-[260px] w-80 overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-lg)]"
          style={{ top: pos.top, left: pos.left }}
        >
          {url ? (
            isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={name} className="h-full w-full object-contain" />
            ) : (
              <iframe src={url} title={name} className="h-full w-full border-0" />
            )
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
        </div>
      )}
    </span>
  )
}
