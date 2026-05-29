import Link from "next/link"
import { ArrowLeft } from "lucide-react"

/** 상세 페이지 공용 뒤로가기 링크 — 일관된 위치·스타일. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      {label}
    </Link>
  )
}
