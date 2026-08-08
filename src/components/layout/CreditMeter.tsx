"use client"

// 사이드바 하단 AI 크레딧 게이지.
// 소진되면 AI가 막히는데 잔액이 안 보이면 "갑자기 고장난 것"처럼 느껴진다 → 항상 보이는 자리에 둔다.
// 무제한 플랜(premium)은 아예 렌더하지 않는다(보여줄 게 없다).
import { useEffect, useState } from "react"
import Link from "next/link"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

type BudgetInfo = {
  credits: number | null
  creditCap: number | null
}

export function CreditMeter() {
  const [info, setInfo] = useState<BudgetInfo | null>(null)

  useEffect(() => {
    let alive = true
    // GET /api/budget 자체가 credit_sync를 태우므로 이 조회가 '경과일만큼 충전'을 겸한다.
    fetch("/api/budget")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: BudgetInfo | null) => {
        if (alive && d) setInfo(d)
      })
      .catch(() => {
        /* 잔액 표시 실패는 무음 — 사이드바가 깨지면 안 된다 */
      })
    return () => {
      alive = false
    }
  }, [])

  // 무제한 플랜이거나 아직 못 불러왔으면 자리도 차지하지 않는다.
  if (!info || info.credits == null || !info.creditCap) return null

  const balance = Math.max(0, Math.floor(info.credits))
  const cap = info.creditCap
  const pct = Math.min(100, Math.max(0, (balance / cap) * 100))
  const empty = balance <= 0
  const low = !empty && pct <= 20

  return (
    <div className="border-t px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Sparkles className="size-3" />
          AI 크레딧
        </span>
        <span
          className={cn(
            "text-[11px] tabular-nums",
            empty ? "font-semibold text-destructive" : low ? "font-semibold text-amber-600" : "text-muted-foreground"
          )}
        >
          {balance.toLocaleString()} / {cap.toLocaleString()}
        </span>
      </div>

      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
            empty ? "bg-destructive" : low ? "bg-amber-500" : "bg-emerald-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* 소진·임박일 때만 안내 — 평소엔 조용히 숫자만 */}
      {(empty || low) && (
        <p className="mt-1.5 text-[10px] leading-tight text-muted-foreground/80">
          {empty ? "다 썼어요. 내일 다시 충전돼요." : "곧 소진돼요. 매일 조금씩 충전됩니다."}{" "}
          <Link href="/#pricing" className="underline underline-offset-2 hover:text-foreground">
            더 필요하면
          </Link>
        </p>
      )}
    </div>
  )
}
