"use client"

// 결정 승인 배너 — 결정 인프라 Unit A. 회의록을 저장한 직후, AI가 찾은 결정을 **체크 1번으로** 원장에 넣는다.
//
// 🔴 이 화면의 규칙(어기면 제품이 죽는다):
//   · 폼 없음 · 입력 필드 없음 · 클릭 1개(전체 승인). ADR 도입 리포 50%가 5건 미만인 이유가 등록 UI다.
//   · 결정 0건이면 **아무것도 렌더하지 않는다**(스켈레톤·"찾는 중"도 없음 — 저장 후 화면은 조용해야 한다).
//   · confidence < 0.7은 체크가 꺼진 채 뜬다 — 1클릭을 유지하면서 오탐이 원장에 안 들어가게.
//   · 닫으면(scans.dismissed) 다시 뜨지 않는다.
import { useState } from "react"
import { toast } from "sonner"
import { Gavel, Loader2, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export type DecisionDraft = {
  kind: "decision" | "open_question"
  statement: string
  detail: string | null
  topic: string[]
  owner_name: string | null
  excerpt: string
  confidence: number
}

type SupersedeMatch = {
  id: string
  statement: string
  decided_at: string
  relation: "replaces" | "refines" | "contradicts"
  confidence: number
  reason: string
}

const KIND_LABEL: Record<DecisionDraft["kind"], string> = { decision: "결정", open_question: "미결" }

export function DecisionApprovalBanner({
  noteId,
  me,
  drafts,
  meetingDate,
  noteTitle,
  members,
  source = "meeting",
  sourceApp,
  onDone,
  onDismiss,
}: {
  noteId: string
  me: string
  drafts: DecisionDraft[]
  meetingDate: string
  noteTitle: string
  members: { id: string; name: string }[]
  source?: "meeting" | "chat"
  sourceApp?: string
  /** 승인 완료(원장에 기록됨) — 목록 새로고침 */
  onDone: () => void
  /** 닫기 — 커서에 dismissed 기록 */
  onDismiss: () => void
}) {
  const supabase = createClient()
  const wsId = useCurrentWorkspaceId()
  // 기본 체크 = 확신 높은 것만. 나머지는 사용자가 눈으로 보고 켠다.
  const [checked, setChecked] = useState<boolean[]>(() => drafts.map((d) => d.confidence >= 0.7))
  const [saving, setSaving] = useState(false)
  const [ask, setAsk] = useState<{ newId: string; match: SupersedeMatch }[]>([])
  const [asking, setAsking] = useState(false)

  if (drafts.length === 0) return null

  const matchOwner = (name: string | null): string | null => {
    if (!name) return null
    const n = name.trim()
    return members.find((m) => m.name === n)?.id ?? members.find((m) => m.name.includes(n) || n.includes(m.name))?.id ?? null
  }

  const approve = async () => {
    const picked = drafts.filter((_, i) => checked[i])
    if (picked.length === 0) return onDismiss()
    setSaving(true)
    const { data: inserted, error } = await supabase
      .from("meeting_decisions")
      .insert(
        picked.map((d) => ({
          workspace_id: wsId as string,
          note_id: noteId,
          kind: d.kind,
          statement: d.statement.trim().slice(0, 300),
          detail: d.detail?.trim() || null,
          topic: d.topic.slice(0, 4),
          owner_id: matchOwner(d.owner_name),
          decided_at: meetingDate || new Date().toLocaleDateString("en-CA"),
          confidence: d.confidence,
          source,
          source_app: sourceApp ?? null,
          source_excerpt: d.excerpt.slice(0, 200),
          source_title: noteTitle.slice(0, 200),
          source_date: meetingDate || null,
          approved_by: me,
        })),
      )
      .select("id, statement, topic, kind")
    setSaving(false)
    if (error || !inserted) {
      toast.error(error?.message?.includes("Standard") ? error.message : "원장에 기록하지 못했어요.")
      return
    }
    toast.success(`결정 ${inserted.length}건을 원장에 기록했어요.`)
    onDone()

    // 번복 후보 확인 — 결정(decision)만, 최대 2건까지만 묻는다(질문 피로 방지).
    setAsking(true)
    const targets = inserted.filter((r) => r.kind === "decision").slice(0, 2)
    const found: { newId: string; match: SupersedeMatch }[] = []
    for (const t of targets) {
      try {
        const res = await fetch("/api/meeting-notes/match-supersede", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statement: t.statement, topics: t.topic, excludeNoteId: noteId }),
        })
        if (!res.ok) continue
        const j = (await res.json()) as { match: SupersedeMatch | null }
        if (j.match) found.push({ newId: t.id, match: j.match })
      } catch {
        /* 판정 실패는 조용히 — 승인은 이미 끝났다 */
      }
    }
    setAsking(false)
    if (found.length === 0) onDismiss()
    else setAsk(found)
  }

  const confirmSupersede = async (item: { newId: string; match: SupersedeMatch }, yes: boolean) => {
    if (yes) {
      const { error } = await supabase.rpc("link_decision_supersede", {
        p_new: item.newId,
        p_old: item.match.id,
        p_relation: item.match.relation,
      })
      if (error) toast.error("연결하지 못했어요.")
      else {
        toast.success(item.match.relation === "refines" ? "이전 결정을 구체화한 것으로 연결했어요." : "이전 결정을 대체한 것으로 기록했어요.")
        onDone()
      }
    } else {
      // "별개예요" — 같은 쌍을 두 번 묻지 않게 기억한다
      const { data: cur } = await supabase.from("meeting_decisions").select("dismissed_candidates").eq("id", item.newId).maybeSingle()
      await supabase
        .from("meeting_decisions")
        .update({ dismissed_candidates: [...(cur?.dismissed_candidates ?? []), item.match.id] })
        .eq("id", item.newId)
    }
    const rest = ask.filter((a) => a.newId !== item.newId)
    setAsk(rest)
    if (rest.length === 0) onDismiss()
  }

  // 번복 확인 단계 — 승인 직후에만, 조용히. (회의 중이 아니라 여기서 묻는 이유: 사회적 리스크)
  if (ask.length > 0) {
    return (
      <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
        {ask.map((a) => (
          <div key={a.newId} className="flex flex-wrap items-center gap-2 py-1 text-xs">
            <Gavel className="size-3.5 shrink-0 text-primary" />
            <span className="flex-1">
              <b className="font-medium">{a.match.statement}</b>
              <span className="text-muted-foreground"> ({a.match.decided_at})</span> 결정을{" "}
              {a.match.relation === "refines" ? "구체화한 건가요?" : "대체하나요?"}
            </span>
            <div className="flex shrink-0 gap-1.5">
              <Button type="button" size="sm" onClick={() => void confirmSupersede(a, true)}>네</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void confirmSupersede(a, false)}>별개예요</Button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Gavel className="size-3.5 text-primary" />
        <span className="text-[11px] font-medium text-primary">이번 회의에서 정해진 것 {drafts.length}건</span>
        <span className="flex-1" />
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {drafts.map((d, i) => (
          <label
            key={i}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-lg border bg-card px-2.5 py-2 transition-colors",
              checked[i] ? "border-primary/40" : "border-border opacity-70",
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0"
              checked={checked[i]}
              onChange={() => setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)))}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">{KIND_LABEL[d.kind]}</span>
                <span className="text-sm">{d.statement}</span>
              </span>
              <span className="mt-0.5 line-clamp-1 block text-[10px] text-muted-foreground">“{d.excerpt}”</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5">
        <span className="mr-auto text-[10px] text-muted-foreground">체크한 것만 원장에 남아요. 나중에 “이 결정 아직 유효한가”를 여기서 답합니다.</span>
        <Button type="button" size="sm" onClick={approve} disabled={saving || asking}>
          {(saving || asking) && <Loader2 className="size-3.5 animate-spin" />}
          {checked.filter(Boolean).length}건 기록
        </Button>
      </div>
    </div>
  )
}
