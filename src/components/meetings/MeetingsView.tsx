"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus, NotebookPen, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/shared/Select"
import { FolderGrid } from "@/components/shared/FolderGrid"
import { SelectCheck } from "@/components/shared/SelectCheck"
import { SelectionBar } from "@/components/shared/SelectionBar"
import { Loading, EmptyState } from "@/components/shared/States"
import { MeetingEditor } from "./MeetingEditor"
import { MeetingTable } from "./MeetingTable"
import type { Tables } from "@/lib/supabase/types"

type Note = Tables<"meeting_notes">
type Category = Tables<"meeting_categories">
type FolderRow = { id: string; name: string; created_at: string }
type FolderSort = "name" | "recent" | "old" | "count"

const SORT_OPTIONS = [
  { value: "name", label: "이름순" },
  { value: "recent", label: "최신순" },
  { value: "old", label: "오래된순" },
  { value: "count", label: "회의록 많은순" },
]

export function MeetingsView() {
  const supabase = createClient()
  const [me, setMe] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const [positions, setPositions] = useState<Record<string, string | null>>({})
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [currentFolder, setCurrentFolder] = useState<string | null>(null) // null = 루트(전체)
  const [folderSort, setFolderSort] = useState<FolderSort>("name")
  const [rootOver, setRootOver] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"list" | "edit">("list")
  const [editing, setEditing] = useState<Note | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [listMode, setListMode] = useState<"grid" | "table">("grid")

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return setLoading(false)
    setMe(auth.user.id)
    const [{ data: prof }, { data: list }, { data: ppl }, { data: fdrs }, { data: cats }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", auth.user.id).single(),
      supabase.from("meeting_notes").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name, position"),
      supabase.from("meeting_note_folders").select("id, name, created_at").order("created_at"),
      supabase.from("meeting_categories").select("*").order("sort_order"),
    ])
    setIsAdmin(prof?.role === "admin")
    setNotes((list as Note[]) ?? [])
    setNames(Object.fromEntries((ppl ?? []).map((p) => [p.id, p.name])))
    setPositions(Object.fromEntries((ppl ?? []).map((p) => [p.id, p.position])))
    setFolders((fdrs as FolderRow[]) ?? [])
    setCategories((cats as Category[]) ?? [])
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
        authorPosition={editing ? positions[editing.user_id] : undefined}
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
        <div className="flex items-center gap-2 pr-1">
          <div className="inline-flex rounded-full bg-muted p-0.5 text-xs">
            <button
              onClick={() => setListMode("grid")}
              className={cn(
                "min-w-14 rounded-full px-3 py-1 text-center font-medium transition-colors",
                listMode === "grid" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              그리드
            </button>
            <button
              onClick={() => setListMode("table")}
              className={cn(
                "min-w-14 rounded-full px-3 py-1 text-center font-medium transition-colors",
                listMode === "table" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              표
            </button>
          </div>
          {currentFolder === null && listMode === "grid" && (
            <Select value={folderSort} onChange={(v) => setFolderSort(v as FolderSort)} options={SORT_OPTIONS} align="end" className="h-8" />
          )}
        </div>
      </div>

      {listMode === "table" ? (
        <MeetingTable notes={notes} categories={categories} onOpen={openNote} onReload={load} />
      ) : (
        <>
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

      {/* 다중 선택 = 화면 안 밀리는 하단 플로팅 바 */}
      <SelectionBar count={sel.size} moveOptions={moveOptions} onMove={(fid) => moveNotes([...sel], fid)} onClear={clearSel} />

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
        // 맥북 폴더창식 노트 아이콘 그리드 — 가로 공간 절약. 더블클릭=열기, 드래그·체크박스 이동.
        <div className="flex flex-wrap gap-3">
          {visible.map((n) => {
            const checked = sel.has(n.id)
            const date = (n.meeting_date ?? n.created_at.slice(0, 10)).slice(5).replace("-", ".")
            return (
              <div
                key={n.id}
                draggable
                onDragStart={(e) => startDrag(e, n.id)}
                className={cn("group relative w-24 cursor-grab rounded-2xl p-1 transition-colors active:cursor-grabbing", checked && "bg-primary/10")}
              >
                <SelectCheck checked={checked} onToggle={() => toggleSel(n.id)} className="absolute left-1 top-1 z-10" />
                <button onDoubleClick={() => openNote(n)} title="더블클릭으로 열기" className="flex w-full flex-col items-center">
                  <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-muted/50 transition-colors group-hover:bg-muted">
                    <NotebookPen className="size-9 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <span className="mt-1 w-full truncate px-0.5 text-center text-xs font-medium" title={n.title || "(제목 없음)"}>
                    {n.title || "(제목 없음)"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{date}</span>
                </button>
              </div>
            )
          })}
        </div>
      )}
        </>
      )}
    </div>
  )
}
