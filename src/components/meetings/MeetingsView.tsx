"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus, Paperclip, NotebookPen } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Loading, EmptyState } from "@/components/shared/States"
import { MeetingEditor } from "./MeetingEditor"
import type { Tables } from "@/lib/supabase/types"

type Note = Tables<"meeting_notes">

function snippet(s: string): string {
  const t = s.replace(/\s+/g, " ").trim()
  return t.length > 100 ? `${t.slice(0, 100)}…` : t
}

export function MeetingsView() {
  const supabase = createClient()
  const [me, setMe] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"list" | "edit">("list")
  const [editing, setEditing] = useState<Note | null>(null)

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return setLoading(false)
    setMe(auth.user.id)
    const [{ data: prof }, { data: list }, { data: ppl }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", auth.user.id).single(),
      supabase.from("meeting_notes").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name"),
    ])
    setIsAdmin(prof?.role === "admin")
    setNotes((list as Note[]) ?? [])
    setNames(Object.fromEntries((ppl ?? []).map((p) => [p.id, p.name])))
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const openNote = (n: Note | null) => {
    setEditing(n)
    setView("edit")
  }
  const backToList = () => setView("list")
  const afterChange = () => {
    setView("list")
    load()
  }

  if (loading) return <Loading rows={5} />

  if (view === "edit" && me) {
    return (
      <MeetingEditor
        note={editing}
        me={me}
        isAdmin={isAdmin}
        authorName={editing ? names[editing.user_id] : undefined}
        onBack={backToList}
        onSaved={afterChange}
        onDeleted={afterChange}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">회의 노트</h1>
          <p className="text-sm text-muted-foreground">회의록을 작성하고 팀과 공유하세요. 작성 중 AI로 요약·액션아이템을 뽑을 수 있어요.</p>
        </div>
        <Button size="sm" onClick={() => openNote(null)}>
          <Plus className="size-3.5" /> 새 회의록
        </Button>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="아직 회의록이 없어요"
          description="첫 회의록을 작성해 팀과 공유해 보세요."
          action={
            <Button size="sm" onClick={() => openNote(null)}>
              <Plus className="size-3.5" /> 새 회의록
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => openNote(n)}
              className="flex flex-col gap-1 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.title || "(제목 없음)"}</span>
                {n.attachment_path && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />}
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {(n.meeting_date ?? n.created_at.slice(0, 10)).slice(5).replace("-", ".")}
                </span>
              </div>
              {n.content.trim() && <p className="line-clamp-1 text-xs text-muted-foreground">{snippet(n.content)}</p>}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{names[n.user_id] ?? "직원"}</span>
                {n.attendees && <span className="truncate">· {n.attendees}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
