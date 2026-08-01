// 컴피(범용 비서)의 네이티브 도구 — 앱 내부 데이터를 실제로 조회한다.
//
// 에이전트 채팅(agents/[id]/chat)의 도구는 외부 MCP뿐이라 앱 데이터를 못 읽는다. 컴피는 여기 정의한
// AI SDK tool({execute})을 streamText에 병합해 근태 잔여·프로젝트·일정·할 일을 직접 조회한다.
// 전부 요청자 본인의 서버 Supabase(RLS·활성 워크스페이스 스코프)로 읽어 격리가 보장된다.
// 도구 추가로 커버리지 확장(재무·회의 등은 같은 패턴으로 후속).

import { tool, type ToolSet } from "ai"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { resolveLeavePolicy, computeBalance, type AttendanceBalanceRow } from "@/lib/hr"
import { kstDate } from "@/lib/workspaceContext"

type DB = SupabaseClient<Database>

export function buildCompiTools({ supabase, userId, workspaceId }: { supabase: DB; userId: string; workspaceId: string | null }): ToolSet {
  return {
    get_attendance_balances: tool({
      description:
        "팀 구성원별 연차/반차 잔여를 조회한다. '누가 연차 며칠 남았어', '반차 남은 개수' 같은 질문에 사용. 오너 또는 근태 열람 위임자만 결과가 있고, 권한이 없으면 빈 배열을 반환한다.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!workspaceId) return { members: [], note: "워크스페이스를 찾을 수 없어요." }
        const [{ data: balRows }, { data: hrRow }] = await Promise.all([
          supabase.rpc("attendance_balances", { p_workspace: workspaceId }),
          supabase.from("hr_settings").select("leave_policy").eq("workspace_id", workspaceId).maybeSingle(),
        ])
        const policy = resolveLeavePolicy((hrRow as { leave_policy: unknown } | null)?.leave_policy)
        const asOf = new Date()
        const members = ((balRows as unknown as AttendanceBalanceRow[] | null) ?? []).map((r) => {
          const b = computeBalance(policy, r, asOf)
          return {
            name: r.name,
            remaining_annual_days: b.remaining,
            granted_annual_days: b.granted,
            used_days: b.used,
            used_monthly_count: b.used_monthly,
          }
        })
        return {
          members,
          note: members.length ? undefined : "결과가 없어요 — 오너/근태 위임자만 조회할 수 있고, 구성원 입사일·HR 기준이 설정돼 있어야 정확해요.",
        }
      },
    }),

    list_projects: tool({
      description: "진행/예정 프로젝트 목록을 조회한다(상태·종료예정·중요도). status를 주면 그 상태만.",
      inputSchema: z.object({
        status: z.enum(["planned", "in_progress", "on_hold", "done", "all"]).optional().describe("기본 = 진행/예정(planned·in_progress·on_hold)"),
      }),
      execute: async ({ status }) => {
        let q = supabase.from("projects").select("name, status, start_date, due_date, importance").is("deleted_at", null)
        q = status && status !== "all" ? q.eq("status", status) : q.in("status", ["planned", "in_progress", "on_hold"])
        const { data } = await q.order("due_date", { ascending: true, nullsFirst: false }).limit(40)
        return {
          projects: (data ?? []).map((p) => ({
            name: p.name,
            status: p.status,
            start_date: p.start_date,
            due_date: p.due_date,
            important: (p.importance ?? 0) >= 2,
          })),
        }
      },
    }),

    list_calendar_events: tool({
      description: "다가오는 팀 일정을 조회한다(기본 14일).",
      inputSchema: z.object({ days: z.number().int().min(1).max(60).optional().describe("오늘부터 며칠(기본 14)") }),
      execute: async ({ days }) => {
        const n = days ?? 14
        const from = kstDate()
        const to = kstDate(new Date(Date.now() + n * 86400000).toISOString())
        const { data } = await supabase
          .from("calendar_events")
          .select("title, start_time")
          .gte("start_time", `${from}T00:00:00+09:00`)
          .lte("start_time", `${to}T23:59:59+09:00`)
          .order("start_time", { ascending: true })
          .limit(50)
        return { events: (data ?? []).map((e) => ({ title: e.title, date: e.start_time ? kstDate(e.start_time) : null })) }
      },
    }),

    list_my_tasks: tool({
      description: "내 오늘 할 일(미완료)을 조회한다.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase
          .from("personal_tasks")
          .select("title, due_date")
          .eq("user_id", userId)
          .eq("done", false)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(40)
        return { tasks: (data ?? []).map((t) => ({ title: t.title, due_date: t.due_date })) }
      },
    }),
  }
}
