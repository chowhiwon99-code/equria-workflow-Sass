"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, Fragment } from "react"
import { cn } from "@/lib/utils"
import type { SlashItem } from "./slashItems"

export type SlashMenuRef = { onKeyDown: (e: KeyboardEvent) => boolean }

/**
 * 슬래시(`/`) 명령 메뉴 — suggestion 렌더가 마운트한다. 섹션 헤더 + 키보드 탐색.
 * 아이콘은 slashItems의 lucide 한 세트로 통일.
 */
export const SlashMenu = forwardRef<SlashMenuRef, { items: SlashItem[]; command: (item: SlashItem) => void }>(
  function SlashMenu({ items, command }, ref) {
    const [index, setIndex] = useState(0)
    const listRef = useRef<HTMLDivElement>(null)

    // 필터 갱신 시 첫 항목으로 리셋(노션 동작).
    useEffect(() => setIndex(0), [items])

    // 키보드 이동 시 활성 항목이 항상 보이도록 최소 스크롤.
    useEffect(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`)?.scrollIntoView({ block: "nearest" })
    }, [index])

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: (e) => {
          if (!items.length) return false
          if (e.key === "ArrowDown") {
            setIndex((i) => (i + 1) % items.length)
            return true
          }
          if (e.key === "ArrowUp") {
            setIndex((i) => (i - 1 + items.length) % items.length)
            return true
          }
          if (e.key === "Enter") {
            command(items[Math.min(index, items.length - 1)])
            return true
          }
          return false
        },
      }),
      [items, index, command]
    )

    if (!items.length) {
      return (
        <div className="w-72 rounded-xl border bg-popover p-2.5 text-xs text-muted-foreground shadow-[var(--shadow-lg)]">
          일치하는 명령이 없어요
        </div>
      )
    }

    let lastSection = ""
    return (
      <div ref={listRef} className="max-h-80 w-72 overflow-y-auto rounded-xl border bg-popover p-1 shadow-[var(--shadow-lg)]">
        {items.map((it, i) => {
          const showHeader = it.section !== lastSection
          lastSection = it.section
          const Icon = it.icon
          return (
            <Fragment key={it.key}>
              {showHeader && (
                <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {it.section}
                </div>
              )}
              <button
                type="button"
                data-idx={i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => command(it)}
                onMouseEnter={() => setIndex(i)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                  i === index ? "bg-muted" : "hover:bg-muted/60"
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-card">
                  <Icon className="size-4 text-muted-foreground" />
                </span>
                <span className="flex-1 truncate text-sm">{it.title}</span>
                {it.hint && <span className="shrink-0 text-[10px] text-muted-foreground">{it.hint}</span>}
              </button>
            </Fragment>
          )
        })}
      </div>
    )
  }
)
