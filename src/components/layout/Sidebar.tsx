"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FEATURES, FEATURE_GROUPS } from "@/lib/config/features"
import { cn } from "@/lib/utils"

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <Link
        href="/dashboard"
        className="flex h-14 items-center gap-2.5 border-b px-4"
      >
        <Image
          src="/equria-logo.png"
          alt="EQURIA"
          width={83}
          height={22}
          priority
          className="dark:hidden"
        />
        <Image
          src="/equria-logo-white.png"
          alt="EQURIA"
          width={83}
          height={22}
          priority
          className="hidden dark:block"
        />
        <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
        <span className="text-xs font-medium tracking-tight text-muted-foreground">
          워크스페이스
        </span>
      </Link>

      <nav className="flex-1 space-y-3 overflow-y-auto p-2">
        {FEATURE_GROUPS.map((group) => {
          const items = FEATURES.filter((f) => f.group === group.id)
          if (items.length === 0) return null
          return (
            <div key={group.id} className="space-y-1">
              {group.label && (
                <p className="px-3 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {group.label}
                </p>
              )}
              {items.map((feature) => {
                const Icon = feature.icon
                const active =
                  pathname === feature.href || pathname.startsWith(`${feature.href}/`)
                return (
                  <Link
                    key={feature.href}
                    href={feature.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1">{feature.label}</span>
                    {feature.status === "planned" && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        예정
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
