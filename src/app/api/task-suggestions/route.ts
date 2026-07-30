import { NextResponse } from "next/server"
import { generateObject } from "ai"
import { createClient } from "@/lib/supabase/server"
import { anthropic, MODELS } from "@/lib/claude/client"
import { taskSuggestionsSchema } from "@/lib/claude/schemas"
import { computeCostUsd } from "@/lib/pricing"
import { checkBudget, BUDGET_EXCEEDED_MSG } from "@/lib/budget"
import { getUserWorkspaceId, withWorkspace } from "@/lib/workspace"
import { getGmailForUser } from "@/lib/google/client"

export const runtime = "nodejs"
export const maxDuration = 60

const SYSTEM = `당신은 회사 업무 비서입니다. 연동된 소스(회사 앱 데이터·Gmail)를 읽고 "지금 해야 할 일"을 제안합니다.

원칙:
- 주어진 데이터에 실제로 있는 근거로만 제안합니다. 지어내지 마세요.
- 이미 등록된 오늘 할 일과 중복되는 제안은 만들지 않습니다.
- 제목은 실행형 한 줄(무엇을 한다), reason에는 근거(누가/언제/어디서)를 담습니다.
- 우선순위: urgent=오늘 안 하면 문제(기한 지남·오늘 마감·긴급 요청) / high=수일 내 / medium=여유.
- source_label은 사용자가 출처를 바로 알아볼 수 있게 구체적으로.
- 확실한 것 3~8개만. 억지로 채우지 않습니다.`

type Src = { title: string; lines: string[] }

/** 대시보드 작업 제안(세션41) — 앱 내부 데이터 + Gmail(연동 시)을 읽고 우선순위·출처 있는 할 일 제안.
 *  읽기 전용(DB 쓰기는 agent_usage 기록뿐). 등록은 클라이언트가 사용자의 확인을 받아 personal_tasks에 쓴다. */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const budget = await checkBudget(user.id)
  if (!budget.ok) return NextResponse.json({ error: BUDGET_EXCEEDED_MSG }, { status: 429 })

  const workspaceId = await getUserWorkspaceId(supabase, user.id)
  const today = new Date()
  const todayS = today.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) // YYYY-MM-DD(KST)
  const weekLater = new Date(today.getTime() + 7 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })

  // ── 소스 수집(전부 RLS 스코프·실패는 소스만 누락) ──
  const sources: Src[] = []
  const used: string[] = []

  const [projRes, taskRes, myTaskRes, evRes, notiRes, runRes] = await Promise.all([
    supabase.from("projects").select("id, name, status, start_date, due_date, importance").is("deleted_at", null).in("status", ["planned", "in_progress", "on_hold"]).limit(30),
    supabase.from("project_tasks").select("title, due_date, done, project_id").eq("done", false).not("due_date", "is", null).lte("due_date", weekLater).limit(60),
    supabase.from("personal_tasks").select("title, done, due_date").eq("user_id", user.id).eq("done", false).limit(50),
    supabase.from("calendar_events").select("title, start_time").gte("start_time", `${todayS}T00:00:00`).lte("start_time", `${weekLater}T23:59:59`).limit(30),
    supabase.from("notifications").select("title, body, type, created_at").eq("user_id", user.id).eq("is_read", false).order("created_at", { ascending: false }).limit(20),
    supabase.from("workflow_runs").select("status, created_at, workflows(name)").order("created_at", { ascending: false }).limit(5),
  ])

  const projects = projRes.data ?? []
  const projName = new Map(projects.map((p) => [p.id, p.name]))
  if (projects.length) {
    used.push("프로젝트")
    sources.push({
      title: "진행/예정 프로젝트",
      lines: projects.map((p) => `- ${p.name} (상태 ${p.status}${p.due_date ? ` · 종료예정 ${p.due_date}` : ""}${(p.importance ?? 0) >= 2 ? " · 중요" : ""})`),
    })
  }
  if (taskRes.data?.length) {
    used.push("프로젝트 할 일")
    sources.push({
      title: "기한 임박/지남 프로젝트 할 일(미완료)",
      lines: taskRes.data.map((t) => `- ${t.title} (기한 ${t.due_date}${(t.due_date as string) < todayS ? " · 지남" : ""}${projName.get(t.project_id) ? ` · 프로젝트: ${projName.get(t.project_id)}` : ""})`),
    })
  }
  if (evRes.data?.length) {
    used.push("캘린더")
    sources.push({ title: "다가오는 일정(7일)", lines: evRes.data.map((e) => `- ${e.title} (${(e.start_time ?? "").slice(0, 10)})`) })
  }
  if (notiRes.data?.length) {
    used.push("알림")
    sources.push({
      title: "읽지 않은 알림",
      lines: notiRes.data.map((n) => `- [${n.type}] ${n.title}${n.body ? ` — ${String(n.body).slice(0, 80)}` : ""}`),
    })
  }
  if (runRes.data?.length) {
    used.push("워크플로우")
    sources.push({
      title: "최근 워크플로우 실행",
      lines: runRes.data.map((r) => {
        const wfName = (r as { workflows?: { name?: string } | null }).workflows?.name ?? "워크플로우"
        return `- ${wfName}: ${r.status} (${String(r.created_at).slice(0, 10)})`
      }),
    })
  }

  // Gmail(연동 시) — 최근 7일 안 읽은 메일 제목·발신자. 미연동/실패는 조용히 건너뜀.
  try {
    const gmail = await getGmailForUser(user.id)
    const list = await gmail.users.messages.list({ userId: "me", q: "is:unread newer_than:7d", maxResults: 10 })
    const ids = (list.data.messages ?? []).map((m) => m.id as string).filter(Boolean)
    if (ids.length) {
      const metas = await Promise.all(
        ids.map((id) => gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["Subject", "From", "Date"] }).catch(() => null))
      )
      const lines = metas
        .filter((m): m is NonNullable<typeof m> => !!m)
        .map((m) => {
          const h = m.data.payload?.headers ?? []
          const get = (n: string) => h.find((x) => x.name?.toLowerCase() === n)?.value ?? ""
          return `- "${get("subject")}" — ${get("from")} (${get("date").slice(0, 16)})${m.data.snippet ? ` · ${m.data.snippet.slice(0, 60)}` : ""}`
        })
      if (lines.length) {
        used.push("Gmail")
        sources.push({ title: "읽지 않은 메일(7일)", lines })
      }
    }
  } catch {
    /* 미연동·토큰 만료 등 — Gmail 소스만 생략 */
  }

  if (sources.length === 0) {
    return NextResponse.json({ suggestions: [], sources_used: [], note: "제안할 근거 데이터가 아직 없어요." })
  }

  const prompt = [
    `오늘 날짜: ${todayS}`,
    "",
    "## 이미 등록된 오늘 할 일(중복 제안 금지)",
    ...(myTaskRes.data?.length ? myTaskRes.data.map((t) => `- ${t.title}${t.due_date ? ` (기한 ${t.due_date})` : ""}`) : ["(없음)"]),
    "",
    ...sources.flatMap((s) => [`## ${s.title}`, ...s.lines, ""]),
    "위 데이터를 근거로 지금 해야 할 일을 제안하세요.",
  ].join("\n")

  const startedAt = Date.now()
  try {
    const result = await generateObject({
      model: anthropic(MODELS.default),
      schema: taskSuggestionsSchema,
      system: SYSTEM,
      prompt,
      temperature: 0.3,
    })
    const inT = result.usage.inputTokens ?? 0
    const outT = result.usage.outputTokens ?? 0
    await supabase.from("agent_usage").insert(
      withWorkspace(
        {
          user_id: user.id,
          tokens_input: inT,
          tokens_output: outT,
          duration_ms: Date.now() - startedAt,
          success: true,
          model: MODELS.default,
          cost_usd: computeCostUsd(MODELS.default, inT, outT),
        },
        workspaceId,
      ),
    )
    return NextResponse.json({ suggestions: result.object.suggestions, sources_used: used })
  } catch (e) {
    await supabase.from("agent_usage").insert(
      withWorkspace(
        {
          user_id: user.id,
          duration_ms: Date.now() - startedAt,
          success: false,
          error_message: e instanceof Error ? e.message : String(e),
          model: MODELS.default,
        },
        workspaceId,
      ),
    )
    return NextResponse.json({ error: "작업 제안 생성에 실패했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 })
  }
}
