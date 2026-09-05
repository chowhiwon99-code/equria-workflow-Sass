"use client"

// 액션아이템 시트 — 회의노트 대개편 P3. AI가 뽑은 '담당자·할 일·기한'을 사람이 한 번 확인하고 저장한다.
//
// 🔴 personal_tasks RLS가 `auth.uid() = user_id`라 **타인 할 일을 대신 만들 수 없다**(마이그092).
//    그래서 저장은 meeting_action_items(팀 공유)에 하고, 담당자에게는 알림이 간다(트리거).
//    담당자가 대시보드에서 "내 할 일로 가져오기"를 누르면 본인 명의로 personal_tasks에 들어간다.
//    내 것으로 지정한 항목만 여기서 바로 personal_tasks에 함께 넣는다(본인 insert라 통과).
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ListChecks, Loader2, Sparkles, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { Button } from "@/components/ui/button"
import { Modal, fieldClass } from "@/components/shared/Modal"

type Draft = { title: string; assignee_id: string | null; due_date: string }
type Member = { id: string; name: string }

export function ActionItemsSheet({
  noteId,
  me,
  sourceText,
  onClose,
  onSaved,
}: {
  noteId: string
  me: string
  /** 추출 입력 = 본문 평문(+전사 요약) */
  sourceText: string
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const wsId = useCurrentWorkspaceId()
  const [members, setMembers] = useState<Member[]>([])
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    const run = async () => {
      // 멤버 목록(담당자 매칭 후보) + AI 추출을 병렬로
      const [{ data: ppl }, res] = await Promise.all([
        supabase.from("profiles").select("id, name"),
        fetch("/api/meeting-notes/extract-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sourceText.slice(0, 24000), today: new Date().toLocaleDateString("en-CA") }),
        }),
      ])
      if (!alive) return
      const memberList = ((ppl as Member[]) ?? []).filter((p) => p.name)
      setMembers(memberList)
      if (!res.ok) {
        toast.error(res.status === 429 ? await res.text() : "액션아이템을 뽑지 못했어요.")
        setDrafts([])
        setBusy(false)
        return
      }
      const { items } = (await res.json()) as {
        items: { title: string; assignee_name: string | null; due_date: string | null }[]
      }
      // 이름 → 계정 퍼지 매칭(정확 일치 → 포함). 확신 없으면 비워 두고 사람이 고르게 한다.
      const match = (name: string | null): string | null => {
        if (!name) return null
        const n = name.trim()
        return (
          memberList.find((m) => m.name === n)?.id ??
          memberList.find((m) => m.name.includes(n) || n.includes(m.name))?.id ??
          null
        )
      }
      setDrafts(
        items.map((it) => ({
          title: it.title,
          assignee_id: match(it.assignee_name),
          due_date: it.due_date && /^\d{4}-\d{2}-\d{2}$/.test(it.due_date) ? it.due_date : "",
        })),
      )
      setBusy(false)
    }
    void run()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patch = (i: number, p: Partial<Draft>) =>
    setDrafts((d) => (d ? d.map((x, idx) => (idx === i ? { ...x, ...p } : x)) : d))
  const drop = (i: number) => setDrafts((d) => (d ? d.filter((_, idx) => idx !== i) : d))

  const save = async () => {
    const rows = (drafts ?? []).filter((d) => d.title.trim())
    if (rows.length === 0) return onClose()
    setSaving(true)
    const { data: inserted, error } = await supabase
      .from("meeting_action_items")
      .insert(
        rows.map((d) => ({
          workspace_id: wsId as string,
          note_id: noteId,
          title: d.title.trim(),
          assignee_id: d.assignee_id,
          due_date: d.due_date || null,
          created_by: me,
        })),
      )
      .select("id, title, due_date, assignee_id")
    if (error || !inserted) {
      setSaving(false)
      toast.error(error?.message?.includes("Standard") ? error.message : "저장하지 못했어요.")
      return
    }

    // 내가 담당인 항목은 곧바로 내 할 일로도 넣는다(본인 명의 insert라 RLS 통과).
    const mine = inserted.filter((r) => r.assignee_id === me)
    if (mine.length > 0) {
      const { data: tasks } = await supabase
        .from("personal_tasks")
        .insert(
          mine.map((r) => ({
            user_id: me,
            workspace_id: wsId as string,
            title: r.title,
            due_date: r.due_date,
          })),
        )
        .select("id")
      // 역기록(어떤 액션아이템이 어떤 할 일이 됐는지) — 완료 상태의 SSOT는 task 쪽이다.
      if (tasks) {
        await Promise.all(
          mine.map((r, i) =>
            tasks[i]
              ? supabase
                  .from("meeting_action_items")
                  .update({ status: "converted", personal_task_id: tasks[i].id })
                  .eq("id", r.id)
              : Promise.resolve(),
          ),
        )
      }
    }
    setSaving(false)
    const others = inserted.length - mine.length
    toast.success(
      `할 일 ${inserted.length}건을 정리했어요.` +
        (mine.length ? ` 내 할 일 ${mine.length}건 추가.` : "") +
        (others ? ` 담당자 ${others}건에게 알림을 보냈어요.` : ""),
    )
    onClose()
    onSaved()
  }

  return (
    <Modal title="회의에서 나온 할 일" onClose={onClose} className="max-w-lg">
      {busy ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 회의록에서 할 일을 뽑는 중…
        </div>
      ) : (drafts ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <ListChecks className="size-7 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">회의록에서 실행할 일을 찾지 못했어요.</p>
          <Button size="sm" variant="outline" onClick={onClose}>닫기</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 rounded-lg bg-primary/5 px-2.5 py-2 text-[11px] text-muted-foreground">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>담당자·기한을 확인하고 저장하세요. 내가 담당인 건 바로 내 할 일로 들어가고, 다른 사람 건에는 알림이 갑니다.</span>
          </div>
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {(drafts ?? []).map((d, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-lg border p-2.5">
                <div className="flex items-start gap-1.5">
                  <input
                    value={d.title}
                    onChange={(e) => patch(i, { title: e.target.value })}
                    className={`${fieldClass} flex-1`}
                  />
                  <button onClick={() => drop(i)} className="mt-1 text-muted-foreground hover:text-destructive" aria-label="삭제">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <select
                    value={d.assignee_id ?? ""}
                    onChange={(e) => patch(i, { assignee_id: e.target.value || null })}
                    className="h-7 rounded-lg border border-border bg-card px-1.5 text-xs outline-none focus-visible:border-ring"
                  >
                    <option value="">담당자 없음</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.id === me ? " (나)" : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={d.due_date}
                    onChange={(e) => patch(i, { due_date: e.target.value })}
                    className="h-7 rounded-lg border border-border bg-card px-1.5 text-xs outline-none focus-visible:border-ring"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>취소</Button>
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-3.5 animate-spin" />} {(drafts ?? []).length}건 저장
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
