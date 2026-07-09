"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Check, SlidersHorizontal, ChevronDown } from "lucide-react"
import { FEATURES, FEATURE_GROUPS } from "@/lib/config/features"
import { cn } from "@/lib/utils"
import { useUnreadDms } from "@/hooks/useUnreadDms"

// 사이드바에서 숨긴 메뉴(href 목록) — 기기별 저장. (B2B 전환 시 프로필 DB로 승격 가능)
const LS_KEY = "equria:sidebar-hidden"
// 접은 폴더(그룹 id 목록) — 기기별 저장.
const CL_KEY = "equria:sidebar-collapsed"

function loadList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

// 애플/토스 결의 부드러운 이징 (Segmented 슬라이딩 썸과 동일)
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]"

function loadHidden(): string[] {
  return loadList(LS_KEY)
}

// iOS식 스위치 — 켜기/끄기 상태를 슬라이딩 썸으로 표현 (components/ui 무수정, 인라인)
function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors duration-200 motion-reduce:transition-none",
        on ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 size-[14px] rounded-full bg-card shadow-[var(--shadow-sm)] transition-transform duration-200 motion-reduce:transition-none",
          EASE,
          on ? "translate-x-3" : "translate-x-0"
        )}
      />
    </span>
  )
}

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname()
  const [hidden, setHidden] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState<string[]>([]) // 접은 폴더(그룹 id)
  const [editing, setEditing] = useState(false)
  // 첫 페인트에선 transition을 끄고(정확한 초기 상태) 이후 토글만 애니메이션 — 하이드레이션 깜빡임 방지
  const [mounted, setMounted] = useState(false)
  const unreadDms = useUnreadDms() // "직원 채팅" 빨간 배지

  // localStorage는 클라이언트에서만 — 마운트 후 로드(하이드레이션 불일치 방지)
  useEffect(() => {
    setHidden(loadHidden())
    setCollapsed(loadList(CL_KEY))
    setMounted(true)
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

  // 폴더(그룹) 접기/펴기 — 헤더 클릭. 편집 중엔 항상 펼침.
  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      try {
        localStorage.setItem(CL_KEY, JSON.stringify(next))
      } catch {
        /* 무시 */
      }
      return next
    })
  }, [])

  // 방향키 내비게이션 — ↑/↓로 메뉴 이동, Home/End로 처음/끝. 접힌 폴더(inert)·숨김 항목은 자동 제외.
  const navRef = useRef<HTMLElement>(null)
  const onNavKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return
    const nav = navRef.current
    if (!nav) return
    // 실제로 포커스 가능한(보이고·inert 밖·tabindex≠-1) 링크/헤더 버튼만 수집
    const items = Array.from(nav.querySelectorAll<HTMLElement>("a[href], button")).filter(
      (el) => el.tabIndex !== -1 && !el.closest("[inert]") && el.getClientRects().length > 0
    )
    if (items.length === 0) return
    e.preventDefault()
    const idx = items.indexOf(document.activeElement as HTMLElement)
    let next: number
    if (e.key === "Home") next = 0
    else if (e.key === "End") next = items.length - 1
    else if (e.key === "ArrowDown") next = idx < 0 ? 0 : (idx + 1) % items.length
    else next = idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length
    items[next]?.focus()
  }, [])

  // grid-rows 0fr↔1fr 높이 트랜지션 래퍼 — JS 측정 없이 부드러운 접힘/펼침
  const collapseRow = (open: boolean) =>
    cn(
      "grid",
      mounted && `transition-[grid-template-rows] duration-300 ${EASE} motion-reduce:transition-none`,
      open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
    )

  return (
    <aside
      className={cn(
        "flex h-full w-[var(--sidebar-width)] shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <Link href="/dashboard" className="flex h-[var(--header-height)] items-center border-b px-4">
        {/* 브랜드 워드마크 — Pretendard, 모노톤 그라데이션으로 느낌있게 */}
        <span className="bg-gradient-to-r from-foreground to-foreground/55 bg-clip-text font-pretendard text-lg font-semibold tracking-tight text-transparent">
          Complow
        </span>
      </Link>

      <nav ref={navRef} onKeyDown={onNavKeyDown} className="flex-1 space-y-3 overflow-y-auto p-2">
        {FEATURE_GROUPS.map((group) => {
          const all = FEATURES.filter((f) => f.group === group.id)
          if (all.length === 0) return null
          const visibleCount = all.filter((f) => !hidden.includes(f.href)).length
          // 평소엔 가시 항목이 0이면 그룹 헤더까지 접고, 편집 중엔 항상 펼침
          const groupHeaderOpen = editing || visibleCount > 0
          // 현재 경로가 이 그룹 항목이면 접혀 있어도 펼쳐 보여준다(저장값은 안 건드림 — '여기 있음' 표시 유지)
          const hasActive = all.some((f) => pathname === f.href || pathname.startsWith(`${f.href}/`))
          // 폴더 접힘: collapsed면 항목을 접음(편집 중·활성 경로 포함 시 항상 펼침)
          const folderOpen = editing || hasActive || !collapsed.includes(group.id)

          return (
            <div key={group.id}>
              {group.label && (
                <div className={collapseRow(groupHeaderOpen)} inert={!groupHeaderOpen}>
                  <div className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        if (!editing) toggleCollapse(group.id)
                      }}
                      className="flex w-full items-center justify-between px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-muted-foreground"
                    >
                      <span>{group.label}</span>
                      {!editing && (
                        <ChevronDown
                          className={cn(
                            "size-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                            collapsed.includes(group.id) && "-rotate-90"
                          )}
                        />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className={collapseRow(folderOpen)} inert={!folderOpen}>
                <div className="overflow-hidden">
                  {all.map((feature) => {
                const Icon = feature.icon
                const isHidden = hidden.includes(feature.href)
                // 편집 중엔 항상 펼침. 평소엔 숨긴 항목만 접음 → 편집 진입/종료 시 부드럽게 펼침/접힘.
                const rowOpen = editing || !isHidden
                const active = pathname === feature.href || pathname.startsWith(`${feature.href}/`)

                return (
                  <div key={feature.href} className={collapseRow(rowOpen)} inert={!rowOpen}>
                    <div className="overflow-hidden">
                      <div className="relative pb-0.5">
                        {/* ── 일반 모드: 네비게이션 링크 (높이 기준·active 하이라이트) ── */}
                        <Link
                          href={feature.href}
                          aria-hidden={editing}
                          tabIndex={editing ? -1 : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-[opacity,background-color,color] duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                            editing && "pointer-events-none opacity-0"
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="flex-1">{feature.label}</span>
                          {feature.href === "/chat" && unreadDms > 0 && (
                            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
                              {unreadDms > 99 ? "99+" : unreadDms}
                            </span>
                          )}
                          {feature.status === "planned" && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">예정</span>
                          )}
                        </Link>

                        {/* ── 편집 모드: 같은 칸에 겹쳐 크로스페이드되는 토글 행 ── */}
                        <button
                          type="button"
                          onClick={() => toggle(feature.href)}
                          aria-hidden={!editing}
                          tabIndex={editing ? undefined : -1}
                          aria-pressed={!isHidden}
                          title={isHidden ? "메뉴 켜기" : "메뉴 끄기"}
                          className={cn(
                            "absolute inset-0 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-opacity duration-200 motion-reduce:transition-none hover:bg-sidebar-accent/40",
                            editing ? "opacity-100" : "pointer-events-none opacity-0"
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-4 shrink-0 transition-opacity duration-200 motion-reduce:transition-none",
                              isHidden && "opacity-40"
                            )}
                          />
                          <span
                            className={cn(
                              "flex-1 text-left transition-opacity duration-200 motion-reduce:transition-none",
                              isHidden && "opacity-40"
                            )}
                          >
                            {feature.label}
                          </span>
                          <Switch on={!isHidden} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
                </div>
              </div>
            </div>
          )
        })}
      </nav>

      {/* 편집 토글 — 항상 노출(메뉴를 다 숨겨도 여기서 복구) */}
      <div className="border-t p-2">
        <button
          onClick={() => setEditing((e) => !e)}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring",
            editing
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          )}
        >
          {/* SlidersHorizontal ↔ Check 크로스페이드 (너비 고정) */}
          <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
            <SlidersHorizontal
              className={cn(
                "absolute size-4 transition-opacity duration-200 motion-reduce:transition-none",
                editing ? "opacity-0" : "opacity-100"
              )}
            />
            <Check
              className={cn(
                "absolute size-4 transition-opacity duration-200 motion-reduce:transition-none",
                editing ? "opacity-100" : "opacity-0"
              )}
            />
          </span>
          <span className="flex-1 text-left">{editing ? "편집 완료" : "사이드바 편집"}</span>
        </button>

        {/* 도움말 — grid-rows로 슬라이드 인/아웃 */}
        <div className={collapseRow(editing)}>
          <div className="overflow-hidden">
            <p className="px-3 pt-1 text-[10px] leading-tight text-muted-foreground/70">
              스위치로 메뉴를 켜고 끄세요 · 이 기기에 저장됩니다
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
