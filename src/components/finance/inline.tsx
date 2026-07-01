"use client"

import { cn } from "@/lib/utils"

// 비제어 인라인 에디터 — value 변경(재로드) 시 key로 리마운트해 입력 중 값을 덮지 않음.

export function InlineText({ value, onCommit, className, placeholder = "이름" }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string }) {
  return (
    <input
      key={value}
      defaultValue={value}
      placeholder={placeholder}
      onBlur={(e) => {
        const v = e.target.value.trim()
        if (v && v !== value) onCommit(v)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur()
        if (e.key === "Escape") {
          e.currentTarget.value = value
          e.currentTarget.blur()
        }
      }}
      className={cn("rounded border-0 bg-transparent px-1 py-0.5 text-xs outline-none focus:bg-background focus:ring-1 focus:ring-ring", className ?? "w-full")}
    />
  )
}

export function InlineNumber({ value, onCommit, onLive, width = "w-full" }: { value: number; onCommit: (v: number) => void; onLive?: (v: number) => void; width?: string }) {
  const fmt = (v: number) => (v ? v.toLocaleString() : "")
  return (
    <input
      key={value}
      defaultValue={fmt(value)}
      inputMode="decimal"
      placeholder="0"
      onFocus={(e) => {
        e.currentTarget.value = value ? String(value) : ""
        e.currentTarget.select()
      }}
      onChange={onLive ? (e) => { const num = Number(e.currentTarget.value.replace(/,/g, "")); if (!Number.isNaN(num)) onLive(num) } : undefined}
      onBlur={(e) => {
        const num = Number(e.target.value.replace(/,/g, ""))
        if (!Number.isNaN(num) && num !== value) onCommit(num)
        else e.currentTarget.value = fmt(value)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur()
      }}
      className={cn(width, "rounded border-0 bg-transparent px-1 py-0.5 text-right text-xs tabular-nums outline-none focus:bg-background focus:ring-1 focus:ring-ring")}
    />
  )
}

export function InlinePercent({ value, onCommit, onLive }: { value: number; onCommit: (v: number) => void; onLive?: (v: number) => void }) {
  const fmt = (v: number) => (v ? String(+(v * 100).toFixed(2)) : "")
  return (
    <span className="inline-flex items-center">
      <input
        key={value}
        defaultValue={fmt(value)}
        inputMode="decimal"
        placeholder="0"
        onFocus={(e) => {
          e.currentTarget.value = value ? String(+(value * 100).toFixed(2)) : ""
          e.currentTarget.select()
        }}
        onChange={onLive ? (e) => { const num = Number(e.currentTarget.value.replace(/,/g, "")); if (!Number.isNaN(num)) onLive(num / 100) } : undefined}
        onBlur={(e) => {
          const num = Number(e.target.value.replace(/,/g, ""))
          if (!Number.isNaN(num)) onCommit(num / 100)
          else e.currentTarget.value = fmt(value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur()
        }}
        className="w-10 rounded border-0 bg-transparent px-1 py-0.5 text-right text-xs tabular-nums outline-none focus:bg-background focus:ring-1 focus:ring-ring"
      />
      %
    </span>
  )
}
