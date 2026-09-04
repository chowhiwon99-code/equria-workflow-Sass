"use client"

// 아이디어 창고 — 회의노트 대개편 P1. 회의 노트 화면의 세 번째 보기(그리드·표·아이디어).
// 카드 그리드 + 상태 칩(씨앗→검토→채택/보류, 낙관적 전환) + AI 태그 + 원문(회의록) 점프.
// P4에서 재부상 카드·뇌구조 그래프(아이디어 지도)가 여기에 얹힌다.
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Lightbulb, Plus, Trash2, FileText } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState, Loading } from "@/components/shared/States"
import { IdeaCaptureDialog } from "./IdeaCaptureDialog"
import type { Tables } from "@/lib/supabase/types"

type Idea = Tables<"ideas">
type IdeaStatus = "seed" | "review" | "adopted" | "parked"

const STATUS_LABEL: Record<IdeaStatus, string> = { seed: "씨앗", review: "검토 중", adopted: "채택", parked: "보류" }
const STATUS_ORDER: IdeaStatus[] = ["seed", "review", "adopted", "parked"]
const STATUS_STYLE: Record<IdeaStatus, string> = {
  seed: "bg-muted text-muted-foreground",
  review: "bg-primary/10 text-primary",
  adopted: "bg-success/15 text-success",
  parked: "bg-muted text-muted-foreground/60 line-through",
}

export function IdeasPanel({
  me,
  onOpenNote,
}: {
  me: string
  /** 원문 점프 — 회의록 id로 에디터 열기(MeetingsView.openNote 재사용) */
  onOpenNote: (noteId: string) => void
}) {
  const supabase = createClient()
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<IdeaStatus | "all">("all")
  const [capture, setCapture] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from("ideas").select("*").order("created_at", { ascending: false })
    setIdeas((data as Idea[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // "태그 붙이는 중…" shimmer가 실제로 해소되게 — 백그라운드 분류(classify)가 3~5초 뒤 끝나므로,
  // 태그 없는 신선한(2분 내) 아이디어가 있는 동안만 4초 간격 재조회. 조건이 사라지면 스스로 멈춘다.
  useEffect(() => {
    if (loading) return
    const pending = ideas.some((i) => (i.tags ?? []).length === 0 && Date.now() - new Date(i.created_at).getTime() < 120000)
    if (!pending) return
    const t = setTimeout(() => void load(), 4000)
    return () => clearTimeout(t)
  }, [ideas, loading, load])

  // 상태 전환 — 낙관적(즉시 반영), 실패 시 되돌림. 협업 편집(RLS: 멤버 전원 UPDATE).
  const setStatus = async (idea: Idea, status: IdeaStatus) => {
    if (idea.status === status) return
    const prev = idea.status
    setIdeas((list) => list.map((i) => (i.id === idea.id ? { ...i, status } : i)))
    const { error } = await supabase.from("ideas").update({ status, updated_at: new Date().toISOString() }).eq("id", idea.id)
    if (error) {
      setIdeas((list) => list.map((i) => (i.id === idea.id ? { ...i, status: prev } : i)))
      toast.error("상태를 바꾸지 못했어요.")
    }
  }

  const remove = async (idea: Idea) => {
    if (!confirm(`'${idea.title}' 아이디어를 삭제할까요?`)) return
    const prevList = ideas
    setIdeas((list) => list.filter((i) => i.id !== idea.id))
    const { error, count } = await supabase.from("ideas").delete({ count: "exact" }).eq("id", idea.id)
    if (error || !count) {
      setIdeas(prevList)
      toast.error("삭제하지 못했어요. (작성자·대표·관리자만 가능)")
    }
  }

  if (loading) return <Loading rows={4} />

  const visible = filter === "all" ? ideas : ideas.filter((i) => i.status === filter)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", ...STATUS_ORDER] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s as IdeaStatus | "all")}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              filter === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {s === "all" ? `전체 ${ideas.length}` : `${STATUS_LABEL[s as IdeaStatus]} ${ideas.filter((i) => i.status === s).length}`}
          </button>
        ))}
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => setCapture(true)}>
          <Plus className="size-3.5" /> 아이디어
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title={filter === "all" ? "아직 담긴 아이디어가 없어요" : `${STATUS_LABEL[filter as IdeaStatus]} 상태인 아이디어가 없어요`}
          description="회의록 본문에서 텍스트를 선택해 아이디어로 담거나, / 메뉴에서 '아이디어'를 입력해 보세요."
        />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((idea) => (
            <div key={idea.id} className="group flex flex-col gap-2 rounded-xl border bg-card p-3 transition-shadow hover:shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug">{idea.title}</p>
                <button
                  onClick={() => remove(idea)}
                  className="shrink-0 text-muted-foreground/0 transition-colors hover:text-destructive group-hover:text-muted-foreground"
                  aria-label="아이디어 삭제"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {idea.body && <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{idea.body}</p>}
              <div className="flex flex-wrap items-center gap-1">
                {(idea.tags ?? []).map((t) => (
                  <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">#{t}</span>
                ))}
                {(idea.tags ?? []).length === 0 && (
                  <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground/50 motion-safe:animate-pulse">태그 붙이는 중…</span>
                )}
              </div>
              <div className="mt-auto flex items-center gap-1 pt-1">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(idea, s)}
                    title={STATUS_LABEL[s]}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium transition-all",
                      idea.status === s ? STATUS_STYLE[s] : "text-muted-foreground/40 hover:text-muted-foreground"
                    )}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
                <span className="flex-1" />
                {idea.source_note_id && (
                  <button
                    onClick={() => onOpenNote(idea.source_note_id!)}
                    title="나온 회의록 열기"
                    className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground transition-colors hover:text-primary"
                  >
                    <FileText className="size-3" /> 원문
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {capture && me && (
        <IdeaCaptureDialog me={me} sourceNoteId={null} initialText="" onClose={() => setCapture(false)} onSaved={load} />
      )}
    </div>
  )
}
