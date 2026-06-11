"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"

/**
 * 호버 미리보기 — 트리거에 마우스를 올리면 떠 있는 작은 미리보기를 부드럽게 줌인한다.
 * 호버 시작 즉시 서명 URL을 선요청 + 이미지 프리로드하므로, 팝오버가 뜰 땐 보통 이미 준비됨(로딩 거의 안 보임).
 * URL은 50초 캐시. 이미지/PDF만 미리보기(그 외는 클릭으로 전체보기).
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
  const [pos, setPos] = useState<{ top: number; left: number; flip: boolean } | null>(null)
  const timerRef = useRef<number | null>(null)
  const fetchedAtRef = useRef(0)
  const urlRef = useRef<string | null>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)

  const isImage = (mime?.startsWith("image/") ?? false) || /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(name)
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(name)
  const canPreview = isImage || isPdf

  // 호버 시작 즉시 호출 — URL 선요청 + 이미지 프리로드(팝오버 뜰 때 이미 준비되게)
  const ensureUrl = useCallback(async () => {
    const now = Date.now()
    if (urlRef.current && now - fetchedAtRef.current <= 50000) return
    const u = await getUrl()
    if (u) {
      urlRef.current = u
      fetchedAtRef.current = now
      setUrl(u)
      if (isImage) {
        const img = new Image()
        img.src = u // 브라우저 캐시에 미리 적재
      }
    }
  }, [getUrl, isImage])

  const onEnter = () => {
    if (!canPreview) return
    void ensureUrl() // 딜레이와 병행해 미리 받아둠
    timerRef.current = window.setTimeout(() => {
      const r = wrapRef.current?.getBoundingClientRect()
      if (r) {
        const W = 320
        const H = 260
        const GAP = 10
        const flip = r.right + GAP + W > window.innerWidth - 8
        const left = flip ? Math.max(8, r.left - W - GAP) : r.right + GAP
        const top = Math.max(8, Math.min(r.top, window.innerHeight - H - 8))
        setPos({ top, left, flip })
      }
      setOpen(true)
    }, 220)
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
          className="hover-pop pointer-events-none fixed z-50 h-[260px] w-80 overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-lg)]"
          style={{ top: pos.top, left: pos.left, transformOrigin: pos.flip ? "right center" : "left center" }}
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
