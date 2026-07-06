import Link from "next/link"
import Image from "next/image"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="force-light flex min-h-screen flex-col items-center justify-center bg-background p-4 py-10 text-foreground">
      <Link href="/" className="mb-7 flex items-center gap-2" aria-label="Complow 홈">
        <Image
          src="/complow-logo.png"
          alt="Complow"
          width={215}
          height={120}
          className="h-7 w-auto"
          priority
        />
        <span className="text-[22px] font-extrabold tracking-tight text-foreground">
          Complow<span style={{ color: "#ff4628" }}>.</span>
        </span>
      </Link>
      {children}
    </div>
  )
}
