import {
  Bot, Brain, PenLine, NotebookPen, FileText, BarChart3, TrendingUp, Clapperboard,
  Film, Smartphone, Globe, MessageCircle, Scale, Search, Lightbulb, Target, Wrench,
  ShoppingBag, Sparkles, Package, Receipt, Languages, type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

/**
 * 에이전트 아이콘 렌더 — 이모지→lucide 안전 전환(Option B 1단계).
 * 저장값(agents.icon)은 string. "lucide:Name" 이면 lucide 아이콘, 그 외(이모지·빈값)는 이모지 텍스트로 폴백.
 * → 기존 이모지 DB 행은 100% 그대로 렌더(시각 회귀 0). 미지의 lucide 이름은 Bot으로 폴백(크래시 0).
 * ⚠️ AGENT_LUCIDE 키는 lib/agents.ts의 AGENT_ICONS lucide 이름과 1:1로 맞출 것.
 */

const LUCIDE_PREFIX = "lucide:"

/** lucide 이름 → 컴포넌트 allowlist(임의 import 방지). 에이전트/카테고리에서 쓰는 것만. */
export const AGENT_LUCIDE: Record<string, LucideIcon> = {
  Bot, Brain, PenLine, NotebookPen, FileText, BarChart3, TrendingUp, Clapperboard,
  Film, Smartphone, Globe, MessageCircle, Scale, Search, Lightbulb, Target, Wrench,
  ShoppingBag, Sparkles, Package, Receipt, Languages,
}

export function isLucideIcon(icon: string): boolean {
  return typeof icon === "string" && icon.startsWith(LUCIDE_PREFIX)
}

/**
 * 컴포넌트 렌더 자리(span/button 등)용. 이모지는 그대로 문자열 반환(부모가 font-size로 크기 제어 — 기존과 동일),
 * lucide는 lucideClassName 크기로 렌더. <option> 같은 텍스트 전용 자리엔 쓰지 말 것(agentIconText 사용).
 */
export function renderAgentIcon(icon: string, lucideClassName = "size-[1em]"): ReactNode {
  if (isLucideIcon(icon)) {
    const Cmp = AGENT_LUCIDE[icon.slice(LUCIDE_PREFIX.length)] ?? Bot
    return <Cmp className={lucideClassName} aria-hidden />
  }
  return icon
}

/** 텍스트 전용 자리(<option> 등)용 — 이모지면 그대로, lucide면 ""(아이콘 못 그림). */
export function agentIconText(icon: string): string {
  return isLucideIcon(icon) ? "" : icon
}
