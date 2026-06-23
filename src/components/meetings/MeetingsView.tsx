"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus, NotebookPen, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/shared/Select"
import { FolderGrid } from "@/components/shared/FolderGrid"
import { Loading, EmptyState } from "@/components/shared/States"
import { MeetingEditor } from "./MeetingEditor"
import type { Tables } from "@/lib/supabase/types"

type Note = Tables<"meeting_notes">
type FolderRow = { id: string; name: string; created_at: string }
type FolderSort = "name" | "recent" | "old" | "count"

const SORT_OPTIONS = [
  { value: "name", label: "이름순" },
  { value: "recent", label: "최신순" },
  { value: "old", label: "오래된순" },
  { value: "count", label: "회의록 많은순" },
]

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
  const [currentFolder, setCurrentFolder] = useState<string | null>(null) // null = 루트(전체)
  const [folderSort, setFolderSort] = useState<FolderSort>("name")
  const [rootOver, setRootOver] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
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
      supabase.from("meeting_note_folders").select("id, name, created_at").order("created_at"),
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

  const clearSel = () => setSel(new Set())
  const toggleSel = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const goFolder = (id: string | null) => {
    setCurrentFolder(id)
    clearSel()
  }

  const openNote = (n: Note | null) => {
    setEditing(n)
    setView("edit")
  }
  const backToList = () => setView("list")
  const afterChange = () => {
    setView("list")
    load()
  }

  const createFolder = async (name: string) => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { error } = await supabase.from("meeting_note_folders").insert({ name, created_by: auth.user.id })
    if (error) return toast.error("폴더를 만들지 못했어요.")
    toast.success("폴더를 만들었어요.")
    load()
  }

  const renameFolder = async (id: string, name: string) => {
    // RLS(mnf_update)가 만든 사람·대표·관리자만 허용 → 0행이면 권한 없음.
    const { data, error } = await supabase.from("meeting_note_folders").update({ name }).eq("id", id).select("id")
    if (error || !data?.length) return toast.error("이름을 바꾸지 못했어요. (만든 사람·대표·관리자만 가능)")
    load()
  }

  const deleteFolder = async (id: string) => {
    const f = folders.find((x) => x.id === id)
    if (!confirm(`'${f?.name ?? "폴더"}' 폴더를 삭제할까요? 안에 있던 회의록은 '미분류'로 남아요.`)) return
    // RLS로 막히면 0행 삭제(에러 없음) → count로 감지.
    const { error, count } = await supabase.from("meeting_note_folders").delete({ count: "exact" }).eq("id", id)
    if (error || !count) return toast.error("삭제하지 못했어요. (만든 사람·대표·관리자만 가능)")
    if (currentFolder === id) setCurrentFolder(null)
    toast.success("폴더를 삭제했어요.")
    load()
  }

  // 여러 회의록을 한 번에 폴더로 이동(노트 폴더 이동은 멤버 누구나 — set_meeting_note_folder).
  const moveNotes = async (ids: string[], folderId: string | null) => {
    if (ids.length === 0) return
    const results = await Promise.all(ids.map((id) => supabase.rpc("set_meeting_note_folder", { note_id: id, new_folder: folderId })))
    const failed = results.filter((r) => r.error).length
    if (failed) toast.error(`${failed}개는 옮기지 못했어요.`)
    if (failed < ids.length) toast.success(`${ids.length - failed}개 옮겼어요.`)
    clearSel()
    load()
  }

  const dragIdsFor = (id: string) => (sel.has(id) && sel.size > 0 ? [...sel] : [id])
  const startDrag = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", dragIdsFor(id).join(","))
    e.dataTransfer.effectAllowed = "move"
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

  const visible = notes.filter((n) => (currentFolder === null ? !n.folder_id : n.folder_id === currentFolder))
  const countOf = (fid: string) => notes.filter((n) => n.folder_id === fid).length
  const sortedFolders = [...folders].sort((a, b) => {
    if (folderSort === "name") return a.name.localeCompare(b.name, "ko")
    if (folderSort === "recent") return b.created_at.localeCompare(a.created_at)
    if (folderSort === "old") return a.created_at.localeCompare(b.created_at)
    return countOf(b.id) - countOf(a.id)
  })
  const gridItems = sortedFolders.map((f) => ({ id: f.id, name: f.name, count: countOf(f.id) }))
  const currentName = folders.find((f) => f.id === currentFolder)?.name
  const moveOptions = [{ value: "none", label: "미분류" }, ...folders.map((f) => ({ value: f.id, label: f.name }))]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">회의 노트</h1>
          <p className="text-sm text-muted-foreground">
            회의록을 작성하고 팀과 공유하세요. 폴더를 더블클릭해 열고, 회의록을 끌어다 정리하세요.
          </p>
        </div>
        <Button size="sm" onClick={() => openNote(null)}>
          <Plus className="size-3.5" /> 새 회의록
        </Button>
      </div>

      {/* 경로(breadcrumb) + 폴더 정렬 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-sm">
          <button
            onClick={() => goFolder(null)}
            onDragOver={(e) => {
              e.preventDefault()
              setRootOver(true)
            }}
            onDragLeave={() => setRootOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setRootOver(false)
              const ids = e.dataTransfer.getData("text/plain").split(",").filter(Boolean)
              if (ids.length) moveNotes(ids, null)
            }}
            className={cn(
              "rounded-lg px-2 py-1 font-medium transition-colors",
              rootOver
                ? "bg-primary/10 ring-2 ring-inset ring-primary"
                : currentFolder === null
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            전체
          </button>
          {currentName && (
            <>
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <span className="rounded-lg px-2 py-1 font-medium text-foreground">{currentName}</span>
            </>
          )}
        </div>
        {currentFolder === null && (
          <Select value={folderSort} onChange={(v) => setFolderSort(v as FolderSort)} options={SORT_OPTIONS} align="end" className="h-8" />
        )}
      </div>

      {/* 루트에서만 폴더 그리드 */}
      {currentFolder === null && (
        <FolderGrid
          folders={gridItems}
          onOpen={(id) => goFolder(id)}
          onCreate={createFolder}
          onRename={renameFolder}
          onDelete={deleteFolder}
          onDropItems={(ids, folderId) => moveNotes(ids, folderId)}
        />
      )}

      {/* 다중 선택 이동 바 */}
      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">{sel.size}개 선택</span>
          <Select
            value="__"
            onChange={(v) => {
              if (v !== "__") moveNotes([...sel], v === "none" ? null : v)
            }}
            options={[{ value: "__", label: "폴더로 이동…" }, ...moveOptions]}
            align="start"
            className="h-8"
          />
          <button onClick={clearSel} className="text-muted-foreground hover:text-foreground">
            선택 해제
          </button>
        </div>
      )}

      {/* 노트 목록 */}
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
        <p className="px-1 py-6 text-center text-sm text-muted-foreground">
          {currentFolder === null && folders.length > 0
            ? "폴더를 더블클릭해 열거나, 회의록을 폴더로 끌어다 놓으세요."
            : currentFolder === null
              ? "낱개(미분류) 회의록이 없어요."
              : "이 폴더에 회의록이 없어요."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((n) => {
            const checked = sel.has(n.id)
            return (
              <div
                key={n.id}
                draggable
                onDragStart={(e) => startDrag(e, n.id)}
                className="group flex items-center gap-2"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSel(n.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`${n.title || "회의록"} 선택`}
                  className={cn(
                    "size-4 shrink-0 cursor-pointer accent-primary transition-opacity",
                    checked ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                />
                <button
                  onClick={() => openNote(n)}
                  className={cn(
                    "flex min-w-0 flex-1 cursor-grab flex-col gap-1 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40 active:cursor-grabbing",
                    checked && "ring-2 ring-primary"
                  )}
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
                      onChange={(v) => moveNotes([n.id], v === "none" ? null : v)}
                      options={moveOptions}
                      align="end"
                      className="h-8"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
