"use client"

import { useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = src
  })
}

/**
 * 호버 미리보기 — 트리거에 마우스를 올리면 떠 있는 작은 미리보기를 부드럽게 줌인한다.
 * ★ 로딩 장면 없음: 서명 URL을 받고 (이미지면) 완전히 로드된 뒤에야 팝오버를 띄운다.
 * ★ 모션: rAF 2단계 트랜지션(scale 0.9→1)으로 트리거 쪽에서 확대.
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
  const [entered, setEntered] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number; flip: boolean } | null>(null)
  const hoveringRef = useRef(false)
  const fetchedAtRef = useRef(0)
  const urlRef = useRef<string | null>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)

  const isImage = (mime?.startsWith("image/") ?? false) || /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(name)
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(name)
  const canPreview = isImage || isPdf

  const run = async (start: number) => {
    // 1) 서명 URL 확보(50초 캐시)
    let u = urlRef.current
    if (!u || Date.now() - fetchedAtRef.current > 50000) {
      const fetched = await getUrl()
      if (!fetched) return
      u = fetched
      urlRef.current = u
      fetchedAtRef.current = Date.now()
    }
    if (!hoveringRef.current) return
    setUrl(u)

    // 2) 이미지면 완전히 로드될 때까지 대기(로딩 장면 방지)
    if (isImage) {
      await preloadImage(u)
      if (!hoveringRef.current) return
    }

    // 3) 최소 호버 시간(빠른 통과 시 안 뜨게)
    const wait = 180 - (Date.now() - start)
    if (wait > 0) await sleep(wait)
    if (!hoveringRef.current) return

    // 4) 위치 계산 + 줌인(rAF 2단계로 초기 상태 페인트 후 전이)
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
    setEntered(false)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (hoveringRef.current) setEntered(true)
      })
    )
  }

  const onEnter = () => {
    if (!canPreview) return
    hoveringRef.current = true
    void run(Date.now())
  }
  const onLeave = () => {
    hoveringRef.current = false
    setOpen(false)
    setEntered(false)
  }

  return (
    <span ref={wrapRef} className={className} onMouseEnter={onEnter} onMouseLeave={onLeave} onMouseDown={onLeave} onDragStart={onLeave}>
      {children}
      {open && pos && url && (
        <div
          className={cn(
            "pointer-events-none fixed z-50 h-[260px] w-80 overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-lg)]",
            "transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
            entered ? "scale-100 opacity-100" : "scale-90 opacity-0"
          )}
          style={{ top: pos.top, left: pos.left, transformOrigin: pos.flip ? "right center" : "left center" }}
        >
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={name} className="h-full w-full object-contain" />
          ) : (
            <iframe src={url} title={name} className="h-full w-full border-0" />
          )}
        </div>
      )}
    </span>
  )
}
