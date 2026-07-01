import type { CashAccount, CashCategory } from "@/types"
import { type CashSummary, slotCategory } from "@/lib/cashflowGraph"
import { slotLabel } from "@/lib/cashAccounts"
import { money } from "@/lib/finance"

// 현금흐름 AI 코칭 — 순수 모델. 클라가 buildCoachPayload로 현재 스냅샷을 요약해 서버로 보내고,
// 서버가 buildCoachPrompt로 Claude 프롬프트를 만든다(렌더/DB/네트워크 무관, 양쪽 공용).

export type CoachSlot = {
  name: string
  type: string // 사람이 읽는 구분 라벨(매출/비용/보유금)
  cat: "income" | "expense" | "hold" // 로직용 구분(라벨 변경에 강건)
  amount: number
  currency: string
  group: string | null
}

export type CoachPayload = {
  summaries: CashSummary[] // 통화별 손익 요약(buildSlotGraph의 summary)
  slots: CoachSlot[]
}

/** 현재 슬롯 + 통화별 요약 → 코칭 페이로드(클라이언트). */
export function buildCoachPayload(
  slots: CashAccount[],
  summaries: CashSummary[],
  groups: CashCategory[]
): CoachPayload {
  const gname = (id: string | null | undefined) =>
    id ? groups.find((g) => g.id === id)?.name ?? null : null
  return {
    summaries,
    slots: slots.map((s) => ({
      name: s.name,
      type: slotLabel(s.kind),
      cat: slotCategory(s.kind),
      amount: Number(s.amount ?? 0),
      currency: s.currency,
      group: gname(s.category_id),
    })),
  }
}

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 100) : null

/** 코칭 페이로드 → Claude 프롬프트(서버). 핵심 비율을 미리 계산해 모델의 산술 오류를 줄인다. */
export function buildCoachPrompt(p: CoachPayload): string {
  const lines: string[] = []
  lines.push("회사의 현재 손익(P&L) 스냅샷입니다. 통화별로 분리되어 있습니다.\n")

  for (const s of p.summaries) {
    const expRate = pct(s.expense, s.revenue)
    const marginRate = pct(s.netProfit, s.revenue)
    lines.push(`[통화 ${s.currency}]`)
    lines.push(`- 시작 보유현금: ${money(s.opening, s.currency)}`)
    lines.push(`- 매출 합계: ${money(s.revenue, s.currency)}`)
    lines.push(
      `- 비용 합계: ${money(s.expense, s.currency)}${expRate != null ? ` (매출 대비 ${expRate}%)` : ""}`
    )
    lines.push(`- 보유(적립): ${money(s.reserve, s.currency)}`)
    lines.push(
      `- 순이익(매출−비용): ${money(s.netProfit, s.currency)}${marginRate != null ? ` (순이익률 ${marginRate}%)` : ""}`
    )
    lines.push(`- 가용현금(시작+매출−비용−보유): ${money(s.available, s.currency)}`)
    lines.push("")
  }

  // 통화별 비용 총액 → 각 비용 항목의 비중(%)을 프롬프트에 병기.
  const expTotal = new Map<string, number>()
  for (const sl of p.slots) if (sl.cat === "expense") expTotal.set(sl.currency, (expTotal.get(sl.currency) ?? 0) + sl.amount)

  lines.push("항목 상세:")
  for (const sl of p.slots) {
    let share = ""
    if (sl.cat === "expense") {
      const s = pct(sl.amount, expTotal.get(sl.currency) ?? 0)
      if (s != null) share = ` — 비용의 ${s}%`
    }
    const grp = sl.group ? ` [${sl.group}]` : ""
    lines.push(`- (${sl.type}) ${sl.name}${grp}: ${money(sl.amount, sl.currency)}${share}`)
  }

  return lines.join("\n")
}
