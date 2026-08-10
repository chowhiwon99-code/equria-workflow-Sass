"use client"

// 사이드바 하단 AI 사용량 게이지.
// 자동 실행이 막히면 잔량이 안 보일 때 "갑자기 고장난 것"처럼 느껴진다 → 항상 보이는 자리에 둔다.
// 무제한 플랜(premium)은 아예 렌더하지 않는다(보여줄 게 없다).
//
// ⚠️ 표기는 "크레딧"이 아니라 **사용량 %**다. 구독료에 크레딧이 포함되면 환금성으로 분류돼
// PG 심사가 막힌다(KCP 거절 사유 ①, 2026-08-10). 내부 단위(1크레딧=$0.01 원가)와 DB·트리거는
// 그대로 두고 표시만 바꾼다 — lib/credits.ts 참고.
//
// 남은 양이 음수일 수 있다(하이브리드 한도: 채팅은 포함량을 넘겨도 공정 사용 범위에서 계속 된다).
// 그 구간은 0%로 바닥을 치되 "자동 실행만 멈춤"이라고 알려 채팅이 고장난 걸로 오해하지 않게 한다.
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

  const remaining = info.credits
  const cap = info.creditCap
  // 남은 비율(%). 음수 잔액은 0%로 바닥 처리.
  const pct = Math.max(0, Math.min(100, Math.round((remaining / cap) * 100)))
  const empty = remaining <= 0
  const low = !empty && pct <= 20

  return (
    <div className="border-t px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Sparkles className="size-3" />
          AI 사용량
        </span>
        <span
          className={cn(
            "text-[11px] tabular-nums",
            empty ? "font-semibold text-destructive" : low ? "font-semibold text-amber-600" : "text-muted-foreground"
          )}
        >
          {empty ? "다 씀" : `${pct}% 남음`}
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
          {empty ? "자동 실행만 멈췄어요. 채팅은 그대로 쓸 수 있어요." : "곧 소진돼요. 조금씩 다시 채워집니다."}{" "}
          <Link href="/#pricing" className="underline underline-offset-2 hover:text-foreground">
            더 필요하면
          </Link>
        </p>
      )}
    </div>
  )
}
