"use client"

// 관련 항목 사이드카 — 회의노트 대개편 P2 (Mem "Related Mems" 패턴).
// 작성 중인 제목을 신호로, 비슷한 얘기를 했던 과거 회의를 옆에 조용히 띄운다(잊고 있던 맥락 재발견).
// 결과 없으면 아무것도 렌더하지 않는다(빈 패널 금지 — 품질 기준). xl 미만 화면에선 숨김(본문 우선).
import { useEffect, useState } from "react"
import { History } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"

type Related = { id: string; title: string; meeting_date: string | null; snippet: string }

export function RelatedSidebar({
  currentNoteId,
  title,
  onOpenNote,
}: {
  currentNoteId: string | null
  title: string
  onOpenNote: (noteId: string) => void
}) {
  const wsId = useCurrentWorkspaceId()
  const [related, setRelated] = useState<Related[]>([])

  // 제목이 잦아들면(800ms) 검색 — 같은 RPC(search_meeting_notes)를 쓰므로 검색창과 결과 기준이 같다.
  useEffect(() => {
    const q = title.trim()
    if (!wsId || q.length < 2) {
      return
    }
    const t = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase.rpc("search_meeting_notes", { p_workspace: wsId, p_q: q, p_limit: 4 })
      setRelated(((data ?? []) as Related[]).filter((r) => r.id !== currentNoteId).slice(0, 3))
    }, 800)
    return () => clearTimeout(t)
  }, [title, wsId, currentNoteId])

  if (related.length === 0) return null

  return (
    <aside className="fixed right-6 top-28 hidden w-60 flex-col gap-2 xl:flex">
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <History className="size-3" /> 비슷한 얘기를 했던 회의
      </span>
      {related.map((r) => (
        <button
          key={r.id}
          onClick={() => onOpenNote(r.id)}
          className="rounded-xl border bg-card p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <p className="truncate text-xs font-medium">{r.title}</p>
          {r.meeting_date && <p className="text-[10px] text-muted-foreground">{r.meeting_date}</p>}
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{r.snippet}</p>
        </button>
      ))}
    </aside>
  )
}
