"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus, NotebookPen, Folder, FolderPlus } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/shared/Select"
import { FolderSidebarItem } from "@/components/shared/FolderSidebarItem"
import { Loading, EmptyState } from "@/components/shared/States"
import { MeetingEditor } from "./MeetingEditor"
import type { Tables } from "@/lib/supabase/types"

type Note = Tables<"meeting_notes">
type FolderRow = { id: string; name: string }

/** 본문 HTML에서 미리보기용 평문 추출. */
function snippet(html: string): string {
  const t = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
  return t.length > 100 ? `${t.slice(0, 100)}…` : t
}

export function MeetingsView() {
  const supabase = createClient()
  const [me, setMe] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [selected, setSelected] = useState<string>("all") // "all" | "none" | folderId
  const [newFolder, setNewFolder] = useState("")
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"list" | "edit">("list")
  const [editing, setEditing] = useState<Note | null>(null)

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return setLoading(false)
    setMe(auth.user.id)
    const [{ data: prof }, { data: list }, { data: ppl }, { data: fdrs }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", auth.user.id).single(),
      supabase.from("meeting_notes").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name"),
      supabase.from("meeting_note_folders").select("id, name").order("sort").order("created_at"),
    ])
    setIsAdmin(prof?.role === "admin")
    setNotes((list as Note[]) ?? [])
    setNames(Object.fromEntries((ppl ?? []).map((p) => [p.id, p.name])))
    setFolders((fdrs as FolderRow[]) ?? [])
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

  const createFolder = async () => {
    const name = newFolder.trim()
    if (!name) return
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { error } = await supabase.from("meeting_note_folders").insert({ name, created_by: auth.user.id })
    if (error) return toast.error("폴더를 만들지 못했어요.")
    setNewFolder("")
    toast.success("폴더를 만들었어요.")
    load()
  }

  const deleteFolder = async (f: FolderRow) => {
    if (!confirm(`'${f.name}' 폴더를 삭제할까요? 안에 있던 회의록은 '미분류'로 남아요.`)) return
    // RLS로 막히면 0행 삭제(에러 없음) → count로 감지.
    const { error, count } = await supabase
      .from("meeting_note_folders")
      .delete({ count: "exact" })
      .eq("id", f.id)
    if (error || !count) return toast.error("삭제하지 못했어요. (만든 사람·대표·관리자만 가능)")
    if (selected === f.id) setSelected("all")
    toast.success("폴더를 삭제했어요.")
    load()
  }

  const moveNote = async (noteId: string, folderId: string | null) => {
    const { error } = await supabase.rpc("set_meeting_note_folder", { note_id: noteId, new_folder: folderId })
    if (error) return toast.error("폴더를 옮기지 못했어요.")
    toast.success("폴더를 옮겼어요.")
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

  const visible = notes.filter((n) =>
    selected === "all" ? true : selected === "none" ? !n.folder_id : n.folder_id === selected
  )
  const noneCount = notes.filter((n) => !n.folder_id).length
  const countOf = (fid: string) => notes.filter((n) => n.folder_id === fid).length
  const moveOptions = [{ value: "none", label: "미분류" }, ...folders.map((f) => ({ value: f.id, label: f.name }))]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">회의 노트</h1>
          <p className="text-sm text-muted-foreground">회의록을 작성하고 팀과 공유하세요. 폴더로 정리하고, 작성 중 AI로 요약·액션아이템을 뽑을 수 있어요.</p>
        </div>
        <Button size="sm" onClick={() => openNote(null)}>
          <Plus className="size-3.5" /> 새 회의록
        </Button>
      </div>

      <div className="flex flex-col gap-5 sm:flex-row">
        {/* 폴더 사이드바 */}
        <aside className="flex shrink-0 flex-col gap-1 sm:w-48">
          <FolderSidebarItem label="전체" count={notes.length} active={selected === "all"} onClick={() => setSelected("all")} />
          <FolderSidebarItem
            label="미분류"
            count={noneCount}
            active={selected === "none"}
            onClick={() => setSelected("none")}
            onDropItem={(id) => moveNote(id, null)}
          />
          {folders.map((f) => (
            <FolderSidebarItem
              key={f.id}
              label={f.name}
              count={countOf(f.id)}
              active={selected === f.id}
              icon={<Folder className="size-3.5 shrink-0 text-muted-foreground" />}
              onClick={() => setSelected(f.id)}
              onDelete={() => deleteFolder(f)}
              onDropItem={(id) => moveNote(id, f.id)}
            />
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createFolder()
            }}
            className="mt-1.5 flex items-center gap-1.5"
          >
            <input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              placeholder="새 폴더"
              className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={!newFolder.trim()}
              className="inline-flex shrink-0 items-center rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-40"
              aria-label="폴더 추가"
            >
              <FolderPlus className="size-3.5" />
            </button>
          </form>
        </aside>

        {/* 노트 목록 */}
        <div className="min-w-0 flex-1">
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
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">이 폴더에 회의록이 없어요.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((n) => (
                <div
                  key={n.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", n.id)
                    e.dataTransfer.effectAllowed = "move"
                  }}
                  className="flex items-stretch gap-2"
                >
                  <button
                    onClick={() => openNote(n)}
                    className="flex min-w-0 flex-1 cursor-grab flex-col gap-1 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40 active:cursor-grabbing"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.title || "(제목 없음)"}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {(n.meeting_date ?? n.created_at.slice(0, 10)).slice(5).replace("-", ".")}
                      </span>
                    </div>
                    {snippet(n.content) && <p className="line-clamp-1 text-xs text-muted-foreground">{snippet(n.content)}</p>}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{names[n.user_id] ?? "직원"}</span>
                      {n.attendees && <span className="truncate">· {n.attendees}</span>}
                    </div>
                  </button>
                  {folders.length > 0 && (
                    <div className="flex shrink-0 items-center">
                      <Select
                        value={n.folder_id ?? "none"}
                        onChange={(v) => moveNote(n.id, v === "none" ? null : v)}
                        options={moveOptions}
                        align="end"
                        className="h-8"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}