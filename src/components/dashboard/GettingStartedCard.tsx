"use client"

// 시작하기 카드 — 신규 팀의 첫 5분을 채우는 안내. 대시보드 최상단(공지 위).
//
// 항목은 ACTIVATION-PLAN §2-1 "골든패스" 3단계 그대로다. 5개를 나열하면 "만들 수 있는 것들의
// 목록"이 되어 무엇부터 할지가 오히려 안 보인다 — 3개여야 순서가 보인다.
//
// 완료 상태는 **전부 파생**한다(DB 마이그레이션 0건). 저장하는 건 "닫기" 여부뿐 → localStorage.
//   1단계 팀원 초대     = 좌석을 쓰는 구성원(비게스트) 2명 이상
//   2단계 AI로 진짜 일  = 회의록 · 명함 · 영수증 OCR 중 하나라도 1건
//   3단계 반복 업무 에이전트화 = category가 '시작하기'가 **아닌** 에이전트 1개 이상
//     ⚠️ 시드 에이전트(seedStarterAgents)를 세면 가입 즉시 3단계가 완료로 찍힌다. 반드시 제외한다.
//
// 3개를 다 하면 카드는 스스로 사라지고, 그 사실을 localStorage에 적어 이후엔 조회조차 하지 않는다.
// 업그레이드 유도 문구는 넣지 않는다 — 골든패스 1~3은 무료로 전부 가능해야 한다(대표 결정).

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Bot, Check, Rocket, Sparkles, UserPlus, X, type LucideIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { Surface } from "@/components/shared/Surface"
import { FEATURES } from "@/lib/config/features"
import { cn } from "@/lib/utils"
import { SEED_AGENT_CATEGORY } from "@/lib/seedAgents"

const DISMISS_KEY = "equria:onboarding-dismissed"

/** 2단계 "AI로 진짜 일 한 번"을 실제로 일으키는 세 갈래(= 판정에 쓰는 그 세 가지와 같다). */
const VALUE_SHORTCUTS = ["/meetings", "/finance", "/cards"] as const

type Step = { key: string; icon: LucideIcon; title: string; hint: string; href: string; done: boolean }

export function GettingStartedCard() {
  const supabase = createClient()
  const wsId = useCurrentWorkspaceId()
  // null = 아직 판정 전(그동안은 렌더하지 않는다 — 깜빡임 방지)
  const [state, setState] = useState<{ invited: boolean; usedAi: boolean; builtAgent: boolean } | null>(null)
  const [dismissed, setDismissed] = useState(true) // 저장값을 읽기 전엔 숨김이 안전

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 저장값 복원(SSR 기본값과 하이드레이션 정합)
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1")
  }, [])

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, "1")
    setDismissed(true)
  }, [])

  const load = useCallback(async () => {
    if (!wsId) return
    const [members, meetings, cards, ocr, agents] = await Promise.all([
      supabase.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", wsId).neq("role", "guest"),
      supabase.from("meeting_notes").select("id", { count: "exact", head: true }).eq("workspace_id", wsId),
      supabase.from("business_cards").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).is("deleted_at", null),
      supabase.from("finance_entries").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).eq("source", "ocr").is("deleted_at", null),
      supabase.from("agents").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).eq("is_active", true).neq("category", SEED_AGENT_CATEGORY),
    ])
    const next = {
      invited: (members.count ?? 0) > 1,
      usedAi: (meetings.count ?? 0) > 0 || (cards.count ?? 0) > 0 || (ocr.count ?? 0) > 0,
      builtAgent: (agents.count ?? 0) > 0,
    }
    // 3개를 다 했으면 스스로 사라진다. 저장까지 해서 다음 방문엔 조회조차 하지 않는다.
    if (next.invited && next.usedAi && next.builtAgent) dismiss()
    setState(next)
  }, [supabase, wsId, dismiss])

  useEffect(() => {
    if (dismissed) return // 닫았으면 조회도 하지 않는다
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 진행상황 판정
    void load()
  }, [dismissed, load])

  if (dismissed || !state) return null

  const steps: Step[] = [
    {
      key: "invite",
      icon: UserPlus,
      title: "팀원 초대하기",
      hint: "초대 링크를 카톡·메일로 보내면 끝이에요.",
      href: "/settings#invite",
      done: state.invited,
    },
    {
      key: "value",
      icon: Sparkles,
      title: "AI로 진짜 일 한 번",
      hint: "회의록을 요약하거나 영수증·명함을 찍어보세요.",
      href: "/meetings",
      done: state.usedAi,
    },
    {
      key: "agent",
      icon: Bot,
      title: "반복 업무를 에이전트로",
      hint: "우리 회사가 매번 하는 일을 맡길 에이전트를 만들어요.",
      href: "/agents/new",
      done: state.builtAgent,
    },
  ]
  const doneCount = steps.filter((s) => s.done).length

  return (
    <Surface variant="glass" padding="sm" className="shrink-0 rounded-xl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Rocket className="size-4 text-primary" /> 시작하기
          <span className="text-xs font-normal tabular-nums text-muted-foreground">{doneCount}/3</span>
        </h2>
        <button
          onClick={dismiss}
          className="grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="다시 보지 않기"
          aria-label="시작하기 안내 닫기"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* 3-9 첫날 가치 노출 — 2단계("AI로 진짜 일")를 클릭 한 번 거리로.
          문구는 FEATURES의 description을 그대로 쓴다(사이드바·여기가 다른 말을 하면 안 된다). */}
      {!state.usedAi && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {VALUE_SHORTCUTS.map((href) => {
            const f = FEATURES.find((x) => x.href === href)
            if (!f) return null
            return (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-[var(--shadow-sm)] transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <f.icon className="size-3.5 shrink-0" />
                <span className="truncate">{f.description}</span>
              </Link>
            )
          })}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <Link
            key={s.key}
            href={s.href}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
              s.done ? "border-transparent bg-muted/40" : "hover:bg-muted/50",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums",
                s.done ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              {s.done ? <Check className="size-3" /> : i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("flex items-center gap-1.5 text-sm font-medium", s.done && "text-muted-foreground line-through")}>
                <s.icon className="size-3.5 shrink-0" />
                {s.title}
              </span>
              {!s.done && <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{s.hint}</span>}
            </span>
          </Link>
        ))}
      </div>
    </Surface>
  )
}
