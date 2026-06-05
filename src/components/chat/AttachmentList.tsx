import { FileText, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const IMAGE_MIME_RE = /^image\//
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i

export type AttachmentItem = {
  id: string
  name: string | null
  mime_type: string | null
  url: string | null // 서명 URL (없으면 로딩 중/실패)
}

function isImage(a: AttachmentItem): boolean {
  return (!!a.mime_type && IMAGE_MIME_RE.test(a.mime_type)) || IMAGE_EXT_RE.test(a.name ?? "")
}

/** 메시지의 다중 첨부 렌더(격리) — 이미지는 그리드 썸네일, 그 외는 파일 칩. message_attachments 전용. */
export function AttachmentList({ items, className }: { items: AttachmentItem[]; className?: string }) {
  if (items.length === 0) return null
  const images = items.filter(isImage)
  const files = items.filter((a) => !isImage(a))

  return (
    <div className={cn("flex max-w-[70%] flex-col gap-1.5", className)}>
      {images.length > 0 && (
        <div className={cn("grid gap-1.5", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {images.map((a) => (
            <a
              key={a.id}
              href={a.url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("block overflow-hidden rounded-lg border", !a.url && "pointer-events-none")}
            >
              {a.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.name ?? "이미지"} className="h-28 w-full object-cover" />
              ) : (
                <div className="flex h-28 items-center justify-center bg-muted text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              )}
            </a>
          ))}
        </div>
      )}
      {files.map((a) => (
        <a
          key={a.id}
          href={a.url ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          download
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs transition-colors hover:bg-muted",
            !a.url && "pointer-events-none opacity-60"
          )}
        >
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{a.name ?? "첨부파일"}</span>
        </a>
      ))}
    </div>
  )
}
