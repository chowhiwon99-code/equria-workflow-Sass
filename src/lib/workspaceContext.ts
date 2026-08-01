// 컴피(범용 비서)가 워크스페이스를 "알게" 하는 컨텍스트 — 기능 레지스트리 + 현황 스냅샷.
//
// 두 갈래로 워크스페이스 인지를 준다:
//  1) featuresOverview(): 이 워크스페이스가 가진 사이드바 기능 목록(features.ts SSOT 직렬화) — "무엇을 할 수 있나".
//  2) buildWorkspaceSnapshot(): 지금 상태의 가벼운 요약(진행 프로젝트·오늘 일정·내 할 일·미읽음) — "지금 무슨 일이 있나".
// 깊은 조회(근태 잔여·프로젝트 상세 등)는 agentTools의 네이티브 도구로 필요 시 드릴다운한다.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { FEATURES } from "@/lib/config/features"

type DB = SupabaseClient<Database>

/** KST(Asia/Seoul) 기준 YYYY-MM-DD. */
export function kstDate(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
}

/** 이 워크스페이스가 제공하는 사이드바 기능 목록(ready·네비 노출분). 컴피 시스템 프롬프트 주입용. */
export function featuresOverview(): string {
  const items = FEATURES.filter((f) => !f.hiddenFromNav && f.status === "ready" && f.href !== "/dashboard")
  return items.map((f) => `- ${f.label} (${f.href}): ${f.description}`).join("\n")
}

/** 현재 워크스페이스 상태의 가벼운 스냅샷(전부 RLS 스코프·실패한 소스는 생략). */
export async function buildWorkspaceSnapshot(supabase: DB, userId: string): Promise<string> {
  const todayS = kstDate()
  const [projRes, evRes, taskRes, notiRes] = await Promise.all([
    supabase
      .from("projects")
      .select("name, status, due_date, importance")
      .is("deleted_at", null)
      .in("status", ["planned", "in_progress", "on_hold"])
      .order("due_date", { ascending: true })
      .limit(15),
    supabase
      .from("calendar_events")
      .select("title, start_time")
      .gte("start_time", `${todayS}T00:00:00+09:00`)
      .lte("start_time", `${todayS}T23:59:59+09:00`)
      .order("start_time", { ascending: true })
      .limit(15),
    supabase.from("personal_tasks").select("title, due_date").eq("user_id", userId).eq("done", false).order("due_date", { ascending: true, nullsFirst: false }).limit(15),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_read", false),
  ])

  const lines: string[] = [`오늘: ${todayS} (KST)`]

  const projects = projRes.data ?? []
  if (projects.length) {
    lines.push("", `진행/예정 프로젝트 ${projects.length}건:`)
    for (const p of projects.slice(0, 10)) {
      lines.push(`- ${p.name} (${p.status}${p.due_date ? ` · ~${p.due_date}` : ""}${(p.importance ?? 0) >= 2 ? " · 중요" : ""})`)
    }
  }

  const events = evRes.data ?? []
  if (events.length) {
    lines.push("", `오늘 일정 ${events.length}건:`)
    for (const e of events.slice(0, 10)) lines.push(`- ${e.title}`)
  }

  const tasks = taskRes.data ?? []
  if (tasks.length) {
    lines.push("", `내 미완료 할 일 ${tasks.length}건:`)
    for (const t of tasks.slice(0, 10)) lines.push(`- ${t.title}${t.due_date ? ` (기한 ${t.due_date})` : ""}`)
  }

  const unread = notiRes.count ?? 0
  if (unread > 0) lines.push("", `읽지 않은 알림 ${unread}건`)

  if (lines.length === 1) lines.push("(표시할 현황이 아직 없어요.)")
  return lines.join("\n")
}
