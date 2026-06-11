"use client"

import { useEffect } from "react"
import { X, Download, FileQuestion } from "lucide-react"

/**
 * 인라인 파일 미리보기 — 새 탭 대신 우측 칸(드로어)으로 띄운다.
 * 이미지·PDF는 바로 보여주고, 그 외 형식은 다운로드 안내. ESC/바깥 클릭으로 닫힘.
 */
export function FilePreview({
  url,
  name,
  mime,
  onClose,
}: {
  url: string
  name: string
  mime?: string | null
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const isImage = (mime?.startsWith("image/") ?? false) || /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(name)
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(name)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col bg-card shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <span className="truncate text-sm font-medium" title={name}>
            {name}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={url}
              download={name}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="다운로드 / 원본 열기"
            >
              <Download className="size-4" />
            </a>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="닫기"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-muted/20">
          {isImage ? (
            <div className="flex h-full items-center justify-center p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
            </div>
          ) : isPdf ? (
            <iframe src={url} title={name} className="h-full w-full border-0" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <FileQuestion className="size-10" />
              <p>이 형식은 미리보기를 지원하지 않아요.</p>
              <a
                href={url}
                download={name}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border px-3 py-1.5 text-foreground transition-colors hover:bg-muted"
              >
                다운로드해서 보기
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
