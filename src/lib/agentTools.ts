// 컴피(범용 비서)의 네이티브 도구 — 앱 내부 데이터를 실제로 조회한다.
//
// 에이전트 채팅(agents/[id]/chat)의 도구는 외부 MCP뿐이라 앱 데이터를 못 읽는다. 컴피는 여기 정의한
// AI SDK tool({execute})을 streamText에 병합해 근태 잔여·프로젝트·일정·할 일을 직접 조회한다.
// 전부 요청자 본인의 서버 Supabase(RLS·활성 워크스페이스 스코프)로 읽어 격리가 보장된다.
// 회의록·아이디어 도구는 buildMeetingTools(P2 — 회의노트 대개편)로 분리 — 컴피(병합)와
// 회의 전용 챗 라우트(단독)가 공유한다. 재무 등 나머지 영역도 같은 패턴으로 후속.

import { tool, type ToolSet } from "ai"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { resolveLeavePolicy, computeBalance, type AttendanceBalanceRow } from "@/lib/hr"
import { kstDate } from "@/lib/workspaceContext"

type DB = SupabaseClient<Database>

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s{2,}/g, " ").trim()

/**
 * 회의록·아이디어 창고 도구(P2) — 검색은 search_meeting_notes RPC(pg_trgm) 하나로 통일
 * (검색창·컴피·회의 챗·관련 사이드바가 같은 RPC 소비 — 마이그150 헤더 참고).
 * 인용 규약: 회의록을 근거로 답할 땐 `[제목](/meetings?note=<id>)` 링크로 출처를 남긴다.
 */
export function buildMeetingTools({ supabase, workspaceId }: { supabase: DB; workspaceId: string }): ToolSet {
  return {
    search_meeting_notes: tool({
      description:
        "회의록을 검색한다(제목·참석자·본문). '지난번 X 얘기한 회의', '~에 대해 논의한 적 있어?' 같은 질문에 사용. " +
        "결과의 note_id로 get_meeting_note를 이어 부르면 전문을 읽을 수 있다. 인용할 땐 [제목](/meetings?note=<note_id>) 링크로.",
      inputSchema: z.object({ query: z.string().min(1).max(100).describe("검색어(키워드·주제·사람 이름)") }),
      execute: async ({ query }) => {
        const { data } = await supabase.rpc("search_meeting_notes", { p_workspace: workspaceId, p_q: query, p_limit: 8 })
        return {
          results: (data ?? []).map((r) => ({
            note_id: r.id,
            title: r.title,
            meeting_date: r.meeting_date,
            snippet: r.snippet,
          })),
        }
      },
    }),

    get_meeting_note: tool({
      description: "회의록 한 건의 전문(제목·날짜·참석자·본문·전사 유무)을 읽는다. search_meeting_notes로 찾은 note_id를 넣는다.",
      inputSchema: z.object({ note_id: z.string().uuid() }),
      execute: async ({ note_id }) => {
        const { data: n } = await supabase
          .from("meeting_notes")
          .select("id, title, meeting_date, attendees, content, transcript")
          .eq("id", note_id)
          .eq("workspace_id", workspaceId)
          .maybeSingle()
        if (!n) return { error: "회의록을 찾을 수 없어요." }
        return {
          note_id: n.id,
          title: n.title,
          meeting_date: n.meeting_date,
          attendees: n.attendees,
          content: stripHtml(n.content ?? "").slice(0, 8000),
          has_transcript: !!n.transcript,
        }
      },
    }),

    list_recent_meetings: tool({
      description: "최근 회의록 목록(제목·날짜)을 조회한다. '최근 회의 뭐 있었어' 같은 질문에 사용.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional().describe("기본 10") }),
      execute: async ({ limit }) => {
        const { data } = await supabase
          .from("meeting_notes")
          .select("id, title, meeting_date, attendees")
          .eq("workspace_id", workspaceId)
          .order("meeting_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(limit ?? 10)
        return { meetings: (data ?? []).map((m) => ({ note_id: m.id, title: m.title, meeting_date: m.meeting_date, attendees: m.attendees })) }
      },
    }),

    list_ideas: tool({
      description:
        "아이디어 창고를 조회한다(제목·태그·상태·출처 회의). '아이디어 뭐 쌓였어', '보류했던 아이디어' 같은 질문에 사용. " +
        "status: seed(씨앗)·review(검토 중)·adopted(채택)·parked(보류).",
      inputSchema: z.object({ status: z.enum(["seed", "review", "adopted", "parked", "all"]).optional().describe("기본 = 전체") }),
      execute: async ({ status }) => {
        let q = supabase
          .from("ideas")
          .select("id, title, body, tags, status, source_note_id, created_at")
          .eq("workspace_id", workspaceId)
        if (status && status !== "all") q = q.eq("status", status)
        const { data } = await q.order("created_at", { ascending: false }).limit(30)
        return {
          ideas: (data ?? []).map((i) => ({
            title: i.title,
            summary: (i.body ?? "").slice(0, 200),
            tags: i.tags,
            status: i.status,
            source_note_id: i.source_note_id,
          })),
        }
      },
    }),
  }
}

// workspaceId는 활성 워크스페이스(라우트가 !workspaceId면 403이라 항상 존재). RLS는 개인전용 테이블(personal_tasks)·
// notifications를 멤버십 전체로 열어주므로, 회사 혼입(이큐리아/이큐리아2) 방지를 위해 모든 쿼리에 명시 스코프한다.
export function buildCompiTools({ supabase, userId, workspaceId }: { supabase: DB; userId: string; workspaceId: string }): ToolSet {
  return {
    // 회의록·아이디어 도구 병합(P2) — 컴피가 드디어 회의록을 읽는다(선언돼 있던 후속의 이행)
    ...buildMeetingTools({ supabase, workspaceId }),

    get_attendance_balances: tool({
      description:
        "팀 구성원별 연차/반차 잔여를 조회한다. '누가 연차 며칠 남았어', '반차 남은 개수' 같은 질문에 사용. 오너 또는 근태 열람 위임자만 결과가 있고, 권한이 없으면 빈 배열을 반환한다.",
      inputSchema: z.object({}),
      execute: async () => {
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
        let q = supabase.from("projects").select("name, status, start_date, due_date, importance").eq("workspace_id", workspaceId).is("deleted_at", null)
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
          .eq("workspace_id", workspaceId)
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
          .eq("workspace_id", workspaceId)
          .eq("done", false)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(40)
        return { tasks: (data ?? []).map((t) => ({ title: t.title, due_date: t.due_date })) }
      },
    }),
  }
}
