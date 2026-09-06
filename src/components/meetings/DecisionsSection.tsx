"use client"

// 결정 원장 섹션 — 결정 인프라 Unit A. 이 회의에서 나온 결정을 상시 보여주고, **유효성 배지**를 단다.
// 배지가 이 기능의 본체다: 결정이 지금도 유효한지(유효 / 대체됨 / 철회)를 한눈에 보는 것 —
// ADR이 죽는 두 번째 이유가 "쌓이지만 최신인지 모른다"이기 때문.
// 구조는 ActionItemsSection을 그대로 따른다(같은 자리·같은 패턴이라 학습 비용 0).
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Gavel, CircleCheck, CircleSlash, ArrowRight, Sparkles, Loader2 } from "lucide-react"
import type { Editor } from "@tiptap/react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DecisionApprovalBanner, type DecisionDraft } from "./DecisionApprovalBanner"
import type { Tables } from "@/lib/supabase/types"

type Decision = Tables<"meeting_decisions">

const STATUS_STYLE: Record<string, string> = {
  active: "bg-success/15 text-success",
  superseded: "bg-muted text-muted-foreground line-through",
  dropped: "bg-muted text-muted-foreground/60 line-through",
}
const STATUS_LABEL: Record<string, string> = { active: "유효", superseded: "대체됨", dropped: "철회" }

export function DecisionsSection({
  noteId,
  me,
  canEdit,
  names,
  meetingDate,
  noteTitle,
  editorRef,
  onOpenNote,
  pendingDrafts = null,
  onPendingDone,
}: {
  noteId: string | null
  me: string
  canEdit: boolean
  names: Record<string, string>
  meetingDate: string
  noteTitle: string
  editorRef: React.MutableRefObject<Editor | null>
  onOpenNote?: (noteId: string) => void
  /** 저장 직후 자동 추출된 초안(부모 소유) — 있으면 승인 카드가 뜬다 */
  pendingDrafts?: DecisionDraft[] | null
  /** 승인·닫기 완료 → 부모가 원래 흐름(목록 복귀)을 이어간다 */
  onPendingDone?: () => void
}) {
  const supabase = createClient()
  const [items, setItems] = useState<Decision[]>([])
  const [drafts, setDrafts] = useState<DecisionDraft[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async () => {
    if (!noteId) return
    const { data } = await supabase
      .from("meeting_decisions")
      .select("*")
      .eq("note_id", noteId)
      .order("created_at", { ascending: true })
    setItems((data as Decision[]) ?? [])
  }, [supabase, noteId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    if (!canEdit) return
    void supabase
      .from("profiles")
      .select("id, name")
      .then(({ data }) => setMembers((data ?? []).filter((p) => p.name) as { id: string; name: string }[]))
  }, [supabase, canEdit])

  if (!noteId) return null

  const extract = async () => {
    const text = editorRef.current?.getText().trim() ?? ""
    if (text.length < 200) {
      toast.error("회의 내용을 조금 더 작성한 뒤에 뽑아보세요.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/meeting-notes/extract-decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 24000), today: new Date().toLocaleDateString("en-CA") }),
      })
      if (!res.ok) throw new Error(res.status === 429 ? await res.text() : "결정을 뽑지 못했어요.")
      const j = (await res.json()) as { decisions: DecisionDraft[] }
      if (j.decisions.length === 0) {
        toast.error("합의된 결정으로 볼 만한 게 없었어요.")
        return
      }
      setDrafts(j.decisions)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (d: Decision, status: "active" | "dropped") => {
    const prev = d.status
    setItems((list) => list.map((x) => (x.id === d.id ? { ...x, status } : x)))
    const { error } = await supabase
      .from("meeting_decisions")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", d.id)
    if (error) {
      setItems((list) => list.map((x) => (x.id === d.id ? { ...x, status: prev } : x)))
      toast.error("상태를 바꾸지 못했어요.")
    }
  }

  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Gavel className="size-3.5" /> 이 회의의 결정{items.length > 0 && ` ${items.length}건`}
        </span>
        <span className="flex-1" />
        {canEdit && (
          <Button type="button" size="sm" variant="outline" onClick={extract} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} 결정 뽑기
          </Button>
        )}
      </div>

      {/* 저장 직후 자동 추출(부모) 또는 수동 [결정 뽑기](자체) — 자동이 우선 */}
      {(pendingDrafts ?? drafts) && canEdit && (
        <DecisionApprovalBanner
          noteId={noteId}
          me={me}
          drafts={(pendingDrafts ?? drafts) as DecisionDraft[]}
          meetingDate={meetingDate}
          noteTitle={noteTitle}
          members={members}
          onDone={load}
          onDismiss={() => {
            if (pendingDrafts) onPendingDone?.()
            else setDrafts(null)
          }}
        />
      )}

      {items.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((d) => (
            <li key={d.id} className="flex items-start gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm">
              <span className={cn("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS_STYLE[d.status])}>
                {STATUS_LABEL[d.status]}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn(d.status !== "active" && "text-muted-foreground")}>
                  {d.kind === "open_question" && <span className="mr-1 text-[10px] text-muted-foreground">[미결]</span>}
                  {d.statement}
                </span>
                {d.owner_id && names[d.owner_id] && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">· {names[d.owner_id]}</span>
                )}
                {/* 번복 체인 — 이 결정이 무엇을 대체했는지 점프 */}
                {d.supersedes_id && (
                  <button
                    onClick={() => void jumpToSource(supabase, d.supersedes_id!, onOpenNote)}
                    className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                  >
                    <ArrowRight className="size-3" /> 이전 결정
                  </button>
                )}
              </span>
              {canEdit && d.status === "active" && (
                <button
                  onClick={() => void setStatus(d, "dropped")}
                  title="더 이상 유효하지 않음(철회)"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <CircleSlash className="size-3.5" />
                </button>
              )}
              {canEdit && d.status === "dropped" && (
                <button
                  onClick={() => void setStatus(d, "active")}
                  title="다시 유효로"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-success"
                >
                  <CircleCheck className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 번복 체인 점프 — 이전 결정이 기록된 회의록을 연다(노트가 지워졌으면 안내). */
async function jumpToSource(
  supabase: ReturnType<typeof createClient>,
  decisionId: string,
  onOpenNote?: (noteId: string) => void,
) {
  const { data } = await supabase.from("meeting_decisions").select("note_id, statement, source_title").eq("id", decisionId).maybeSingle()
  if (!data) return
  if (data.note_id && onOpenNote) onOpenNote(data.note_id)
  else toast.message(data.statement, { description: data.source_title ?? "원본 회의록이 삭제됐어요." })
}
