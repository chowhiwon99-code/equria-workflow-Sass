"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus, Minus, Check, SlidersHorizontal } from "lucide-react"
import { FEATURES, FEATURE_GROUPS } from "@/lib/config/features"
import { cn } from "@/lib/utils"

// 사이드바에서 숨긴 메뉴(href 목록) — 기기별 저장. (B2B 전환 시 프로필 DB로 승격 가능)
const LS_KEY = "equria:sidebar-hidden"

function loadHidden(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

export function Sidebar() {
  const pathname = usePathname()
  const [hidden, setHidden] = useState<string[]>([])
  const [editing, setEditing] = useState(false)

  // localStorage는 클라이언트에서만 — 마운트 후 로드(하이드레이션 불일치 방지)
  useEffect(() => {
    setHidden(loadHidden())
  }, [])

  const toggle = useCallback((href: string) => {
    setHidden((prev) => {
      const next = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href]
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next))
      } catch {
        /* 저장 실패해도 화면은 동작 */
      }
      return next
    })
  }, [])

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <Link href="/dashboard" className="flex h-14 items-center gap-2.5 border-b px-4">
        <Image src="/equria-logo.png" alt="EQURIA" width={83} height={22} priority className="dark:hidden" />
        <Image src="/equria-logo-white.png" alt="EQURIA" width={83} height={22} priority className="hidden dark:block" />
        <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
        <span className="text-xs font-medium tracking-tight text-muted-foreground">워크스페이스</span>
      </Link>

      <nav className="flex-1 space-y-3 overflow-y-auto p-2">
        {FEATURE_GROUPS.map((group) => {
          const all = FEATURES.filter((f) => f.group === group.id)
          // 편집 중엔 숨긴 것도 보여줘(+ 로 다시 추가), 평소엔 보이는 것만.
          const items = editing ? all : all.filter((f) => !hidden.includes(f.href))
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
                const isHidden = hidden.includes(feature.href)

                // ── 편집 모드: 링크 대신 +/− 토글 행 ──
                if (editing) {
                  return (
                    <button
                      key={feature.href}
                      onClick={() => toggle(feature.href)}
                      title={isHidden ? "추가" : "빼기"}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isHidden
                          ? "text-muted-foreground/45 hover:bg-sidebar-accent/30"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/40"
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className={cn("flex-1 text-left", isHidden && "line-through")}>{feature.label}</span>
                      {isHidden ? (
                        <Plus className="size-4 shrink-0 text-primary" />
                      ) : (
                        <Minus className="size-4 shrink-0 text-destructive" />
                      )}
                    </button>
                  )
                }

                // ── 일반 모드: 네비게이션 링크 ──
                const active = pathname === feature.href || pathname.startsWith(`${feature.href}/`)
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
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">예정</span>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* 편집 토글 — 항상 노출(메뉴를 다 숨겨도 여기서 복구) */}
      <div className="border-t p-2">
        <button
          onClick={() => setEditing((e) => !e)}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            editing
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          )}
        >
          {editing ? <Check className="size-4 shrink-0" /> : <SlidersHorizontal className="size-4 shrink-0" />}
          <span className="flex-1 text-left">{editing ? "편집 완료" : "사이드바 편집"}</span>
        </button>
        {editing && (
          <p className="px-3 pt-1 text-[10px] leading-tight text-muted-foreground/70">
            − 빼기 · + 추가 · 이 기기에 저장됩니다
          </p>
        )}
      </div>
    </aside>
  )
}
