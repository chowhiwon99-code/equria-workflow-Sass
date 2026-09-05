"use client"

// 회의에서 나온 할 일 — 회의노트 대개편 P3. 노트 하단에 상시 노출되는 액션아이템 목록 + 추출 버튼.
// 저장된 노트에서만 동작한다(note_id 필요). 완료 표시는 개인 할 일 쪽이 SSOT라 여기선 상태만 다룬다.
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { CircleCheck, CircleDashed, ListChecks, Sparkles, X } from "lucide-react"
import type { Editor } from "@tiptap/react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ActionItemsSheet } from "./ActionItemsSheet"
import type { Tables } from "@/lib/supabase/types"

type Item = Tables<"meeting_action_items">

export function ActionItemsSection({
  noteId,
  me,
  canEdit,
  names,
  editorRef,
}: {
  noteId: string | null
  me: string
  canEdit: boolean
  names: Record<string, string>
  editorRef: React.MutableRefObject<Editor | null>
}) {
  const supabase = createClient()
  const wsId = useCurrentWorkspaceId()
  const [items, setItems] = useState<Item[]>([])
  // 시트에 넘길 본문은 **열 때 캡처**한다 — 렌더 중 editorRef를 읽으면 안 된다(react-hooks/refs).
  const [sheetText, setSheetText] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!noteId) return
    const { data } = await supabase
      .from("meeting_action_items")
      .select("*")
      .eq("note_id", noteId)
      .order("created_at", { ascending: true })
    setItems((data as Item[]) ?? [])
  }, [supabase, noteId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  if (!noteId) return null

  // 내 할 일로 가져오기 — 담당자 본인만(personal_tasks RLS). 낙관적 상태 전환.
  const pullToMyTasks = async (item: Item) => {
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status: "converted" } : i)))
    const { data: task, error } = await supabase
      .from("personal_tasks")
      .insert({ user_id: me, workspace_id: wsId as string, title: item.title, due_date: item.due_date })
      .select("id")
      .single()
    if (error || !task) {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status: item.status } : i)))
      toast.error("내 할 일로 가져오지 못했어요.")
      return
    }
    await supabase
      .from("meeting_action_items")
      .update({ status: "converted", personal_task_id: task.id })
      .eq("id", item.id)
    toast.success("내 할 일에 추가했어요.")
  }

  const dismiss = async (item: Item) => {
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status: "dismissed" } : i)))
    const { error } = await supabase.from("meeting_action_items").update({ status: "dismissed" }).eq("id", item.id)
    if (error) {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status: item.status } : i)))
      toast.error("처리하지 못했어요.")
    }
  }

  const open = items.filter((i) => i.status !== "dismissed")

  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <ListChecks className="size-3.5" /> 회의에서 나온 할 일{open.length > 0 && ` ${open.length}건`}
        </span>
        <span className="flex-1" />
        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const text = editorRef.current?.getText().trim() ?? ""
              if (text.length < 20) {
                toast.error("회의 내용을 먼저 작성해 주세요.")
                return
              }
              setSheetText(text)
            }}
          >
            <Sparkles className="size-3.5" /> 할 일 뽑기
          </Button>
        )}
      </div>

      {open.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {open.map((it) => {
            const isMine = it.assignee_id === me
            const converted = it.status === "converted"
            return (
              <li key={it.id} className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm">
                {converted ? (
                  <CircleCheck className="size-3.5 shrink-0 text-success" />
                ) : (
                  <CircleDashed className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className={cn("flex-1 truncate", converted && "text-muted-foreground")}>{it.title}</span>
                {it.assignee_id && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {names[it.assignee_id] ?? "담당자"}
                    {isMine ? " (나)" : ""}
                  </span>
                )}
                {it.due_date && <span className="shrink-0 text-[10px] text-muted-foreground">~{it.due_date.slice(5)}</span>}
                {!converted && isMine && (
                  <button
                    onClick={() => void pullToMyTasks(it)}
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    내 할 일로
                  </button>
                )}
                {!converted && canEdit && (
                  <button onClick={() => void dismiss(it)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="제외">
                    <X className="size-3" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {sheetText !== null && (
        <ActionItemsSheet
          noteId={noteId}
          me={me}
          sourceText={sheetText}
          onClose={() => setSheetText(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
