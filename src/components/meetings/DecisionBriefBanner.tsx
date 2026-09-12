"use client"

// 브리핑 배너 — 결정 인프라 Unit B (push).
//
// 왜 만드는가: 사람은 과거 결정을 **찾으러 가지 않는다**. 크로스미팅 검색이 "2026년 가장 안 쓰이는
// 기능"으로 꼽힌 이유가 그거다(Laxis). 그래서 검색을 개선하는 대신, 새 회의록 제목을 치는 순간
// 관련된 유효 결정과 아직 안 끝난 숙제를 **먼저 들이민다**. 회의 시작 30초 전에 읽히는 자리에.
//
// 🔴 이 화면의 규칙(어기면 Unit A와 같은 이유로 죽는다):
//   · 결과 0이면 **아무것도 렌더하지 않는다** — 스켈레톤·"찾는 중"도 없음(빈 패널 금지).
//   · `status='active'`만 — RPC가 번복된 결정을 이미 걸러낸다. **번복 언어를 렌더하지 않는다**:
//     화면 공유 중 "뒤집힌 결정" 표기는 사회적 사고다(회의 중 개입 금지 원칙의 연장).
//   · 읽기 전용. 입력 필드 0개 · 클릭은 "그 회의 열기" 하나뿐.
//   · **AI 0원** — pg_trgm RPC 2개 + 셀렉트 1개. 크레딧을 쓰지 않으므로 recordAiUsage 대상이 아니다.
//
// 자리: 본문 **위**(RelatedSidebar는 xl 전용 사이드바라 좁은 화면에서 안 보인다 — 브리핑은 읽혀야 한다).
import { useEffect, useState } from "react"
import { Gavel, ListTodo, Sparkles } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"

type BriefDecision = {
  id: string
  statement: string
  decided_at: string
  note_id: string | null
  source_title: string | null
}

type BriefAction = { id: string; title: string; due_date: string | null; note_id: string }

// 제목에서 걷어낼 구조어 — 내용이 아니라 "회의라는 형식"을 가리키는 말들.
// 이게 topic 교집합에 끼면 주제가 다른 결정까지 끌려온다.
const TITLE_STOPWORDS = new Set([
  "회의", "미팅", "회의록", "정기", "주간", "월간", "일일", "오전", "오후", "공유", "자료", "노트", "관련",
])

/**
 * 제목 → 주제 토큰.
 *
 * 🔴 왜 필요한가(실측):
 * `search_decisions`의 문자열 경로는 `similarity(statement, q) > 0.25`인데, 짧은 제목과 긴 결정문의
 * trgm 유사도는 **0.049**로 임계에 한참 못 미친다(2026-09-12 SQL 실측). 즉 `p_q`만 넘기면
 * 배너가 **영영 안 뜬다**. RPC에 있는 `topic && p_topics`(배열 교집합) 경로가 이 용도로 만들어져 있어
 * 제목을 토큰으로 쪼개 같이 넘긴다 — 같은 조건에서 정확히 매칭됨(sim 0.22).
 * `p_q`도 계속 넘긴다: 제목이 결정문에 그대로 들어있는 경우엔 ilike 경로가 더 정확하다.
 */
function topicsOf(title: string): string[] {
  const tokens = title
    .toLowerCase()
    .split(/[\s·,./()[\]{}"'`~!?:;|—-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !TITLE_STOPWORDS.has(t))
  return Array.from(new Set(tokens)).slice(0, 6)
}

export function DecisionBriefBanner({
  currentNoteId,
  title,
  onOpenNote,
}: {
  currentNoteId: string | null
  title: string
  onOpenNote: (noteId: string) => void
}) {
  const wsId = useCurrentWorkspaceId()
  const [decisions, setDecisions] = useState<BriefDecision[]>([])
  const [action, setAction] = useState<BriefAction | null>(null)

  // 제목 타이핑이 잦아들면(800ms) 조회 — RelatedSidebar와 같은 신호·같은 RPC라 결과 기준이 일관된다.
  // 캘린더 초대를 신호로 쓰지 않는 이유: 회의의 상당수는 애초에 초대가 없다.
  useEffect(() => {
    if (!wsId) return
    const q = title.trim()
    let cancelled = false
    // 제목이 짧아졌을 때의 초기화도 타이머 안에서 한다 — 이펙트 본문에서 동기적으로 setState하면
    // 연쇄 렌더가 되고 lint(react-hooks/set-state-in-effect)에도 걸린다.
    const timer = setTimeout(async () => {
      if (cancelled) return
      if (q.length < 2) {
        setDecisions([])
        setAction(null)
        return
      }
      const supabase = createClient()
      const topics = topicsOf(q)
      const [decisionRes, noteRes] = await Promise.all([
        supabase.rpc("search_decisions", {
          p_workspace: wsId,
          p_q: q,
          p_topics: topics.length > 0 ? topics : undefined,
          p_kind: "decision",
          p_status: "active",
          // 생성된 타입이 optional(string | undefined)이라 null을 그대로 넘기면 안 된다 — 미지정과 같은 의미로 보낸다.
          p_exclude_note: currentNoteId ?? undefined,
          p_limit: 2,
        }),
        supabase.rpc("search_meeting_notes", { p_workspace: wsId, p_q: q, p_limit: 4 }),
      ])
      if (cancelled) return
      const found = (decisionRes.data ?? []) as BriefDecision[]
      setDecisions(found)

      // 미완료 액션은 결정과 **독립 경로**로 찾는다 — 결정이 0건이어도 숙제는 남아 있을 수 있다.
      // 'converted'는 이미 개인 할 일로 옮겨가 추적 중이므로 다시 들이밀지 않는다.
      // 매칭된 결정이 달린 회의도 후보에 넣는다 — 제목 검색만으로는 놓치는 회의가 있고, 이미 받아온 값이라 공짜다.
      const noteIds = Array.from(
        new Set([
          ...found.map((d) => d.note_id).filter((id): id is string => !!id),
          ...((noteRes.data ?? []) as { id: string }[]).map((n) => n.id),
        ]),
      ).filter((id) => id !== currentNoteId)
      if (noteIds.length === 0) {
        setAction(null)
        return
      }
      const { data } = await supabase
        .from("meeting_action_items")
        .select("id, title, due_date, note_id")
        .in("note_id", noteIds)
        .eq("status", "open")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(1)
      if (!cancelled) setAction(((data ?? [])[0] as BriefAction | undefined) ?? null)
    }, 800)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [title, wsId, currentNoteId])

  if (decisions.length === 0 && !action) return null

  return (
    <div className="mt-3 rounded-xl border border-dashed bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">이 주제로 이미 정해둔 것</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {decisions.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => d.note_id && onOpenNote(d.note_id)}
            className="flex items-start gap-2 rounded-lg border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <Gavel className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{d.statement}</span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                {d.decided_at}
                {d.source_title ? ` · ${d.source_title}` : ""}
              </span>
            </span>
          </button>
        ))}

        {action && (
          <button
            type="button"
            onClick={() => onOpenNote(action.note_id)}
            className="flex items-start gap-2 rounded-lg border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <ListTodo className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{action.title}</span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                아직 안 끝난 할 일{action.due_date ? ` · 마감 ${action.due_date}` : ""}
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
