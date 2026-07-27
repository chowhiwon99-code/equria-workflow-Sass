import Link from "next/link"
import Image from "next/image"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="force-light flex min-h-screen flex-col items-center justify-center bg-background p-4 py-10 text-foreground">
      {/* 세로형 로고(심볼+워드마크 포함) — 대표 제공 브랜드 로고(2026-07-27) */}
      <Link href="/" className="mb-7" aria-label="Complow 홈">
        <Image
          src="/brand/logo-vertical.png"
          alt="Complow"
          width={1098}
          height={800}
          className="h-24 w-auto"
          priority
        />
      </Link>
      {children}
    </div>
  )
}
