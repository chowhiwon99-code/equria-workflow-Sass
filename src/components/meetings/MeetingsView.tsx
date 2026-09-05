"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Plus, NotebookPen, ChevronRight, Search, MessageCircleQuestion, X } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/shared/Select"
import { FolderGrid } from "@/components/shared/FolderGrid"
import { SelectCheck } from "@/components/shared/SelectCheck"
import { SelectionBar } from "@/components/shared/SelectionBar"
import { Loading, EmptyState } from "@/components/shared/States"
import { MeetingEditor } from "./MeetingEditor"
import { MeetingTable } from "./MeetingTable"
import { MeetingsChat } from "./MeetingsChat"
import { IdeasPanel } from "@/components/ideas/IdeasPanel"
import type { Tables } from "@/lib/supabase/types"

type Note = Tables<"meeting_notes">
/** 목록용 메타 — content(본문 HTML)·graph(jsonb)는 목록에서 안 쓰므로 로드하지 않는다(P0 다이어트).
 *  노트가 쌓여도 목록 페이로드가 본문 크기에 비례해 커지지 않게. 본문은 열 때 lazy fetch. */
export type NoteMeta = Pick<
  Note,
  | "id"
  | "user_id"
  | "workspace_id"
  | "title"
  | "meeting_date"
  | "meeting_time"
  | "attendees"
  | "folder_id"
  | "category_id"
  | "importance"
  | "created_at"
  | "updated_at"
>
const NOTE_META_COLS =
  "id, user_id, workspace_id, title, meeting_date, meeting_time, attendees, folder_id, category_id, importance, created_at, updated_at"
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
  const me = useCurrentUserId()
  const wsId = useCurrentWorkspaceId() // B1-b
  const [isAdmin, setIsAdmin] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const [positions, setPositions] = useState<Record<string, string | null>>({})
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [currentFolder, setCurrentFolder] = useState<string | null>(null) // null = 루트(전체)
  const [folderSort, setFolderSort] = useState<FolderSort>("name")
  const [rootOver, setRootOver] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"list" | "edit">("list")
  const [editing, setEditing] = useState<Note | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [listMode, setListMode] = useState<"grid" | "table" | "ideas">("grid")
  const [chatOpen, setChatOpen] = useState(false) // 창고에 질문(P2)
  const [searchQ, setSearchQ] = useState("")
  const [searchResults, setSearchResults] = useState<{ id: string; title: string; meeting_date: string | null; snippet: string }[] | null>(null)

  const load = useCallback(async () => {
    if (!me) return setLoading(false)
    const [{ data: prof }, { data: list }, { data: ppl }, { data: fdrs }, { data: cats }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", me).single(),
      supabase.from("meeting_notes").select(NOTE_META_COLS).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name, position"),
      supabase.from("meeting_note_folders").select("id, name, created_at").order("created_at"),
      supabase.from("meeting_categories").select("*").order("sort_order"),
    ])
    setIsAdmin(prof?.role === "admin")
    setNotes((list as NoteMeta[]) ?? [])
    setNames(Object.fromEntries((ppl ?? []).map((p) => [p.id, p.name])))
    setPositions(Object.fromEntries((ppl ?? []).map((p) => [p.id, p.position])))
    setFolders((fdrs as FolderRow[]) ?? [])
    setCategories((cats as Category[]) ?? [])
    setLoading(false)
  }, [supabase, me])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // 검색(P2) — 300ms 디바운스 → search_meeting_notes RPC(pg_trgm). 목록은 메타만 들고 있어 로컬 필터 불가.
  // 짧은 질의(<2자)의 결과 클리어도 타임아웃(0ms) 안에서 — effect 동기 setState 금지 규칙 준수.
  useEffect(() => {
    const q = searchQ.trim()
    const short = !wsId || q.length < 2
    const t = setTimeout(
      async () => {
        if (short) {
          setSearchResults(null)
          return
        }
        const { data } = await supabase.rpc("search_meeting_notes", { p_workspace: wsId as string, p_q: q, p_limit: 12 })
        setSearchResults((data ?? []) as NonNullable<typeof searchResults>)
      },
      short ? 0 : 300
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ, wsId])

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

  // 목록은 메타만 들고 있으므로 열 때 본문(content·graph)을 lazy fetch(P0). 새 노트(null)는 즉시.
  // id만 있으면 열 수 있다 — 아이디어 창고의 "원문" 점프(P1)·딥링크(P2)가 재사용.
  const openNote = async (n: Pick<NoteMeta, "id"> | null) => {
    if (!n) {
      setEditing(null)
      setView("edit")
      return
    }
    setView("edit")
    setEditLoading(true)
    setEditing(null)
    const { data, error } = await supabase.from("meeting_notes").select("*").eq("id", n.id).maybeSingle()
    if (error || !data) {
      toast.error("회의록을 불러오지 못했어요.")
      setView("list")
    } else {
      setEditing(data as Note)
    }
    setEditLoading(false)
  }
  const backToList = () => setView("list")
  const afterChange = () => {
    setView("list")
    load()
  }

  // ?note=<id> 딥링크(P2) — 컴피·창고 질의의 인용 링크에서 진입. 로드 완료 후 최초 1회만.
  // setTimeout(0) = openNote의 동기 setState를 effect 본문 밖으로(동기 setState 금지 규칙).
  const deepLinked = useRef(false)
  useEffect(() => {
    if (deepLinked.current || loading) return
    deepLinked.current = true
    const id = new URLSearchParams(window.location.search).get("note")
    if (!id) return
    const t = setTimeout(() => void openNote({ id }), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const createFolder = async (name: string) => {
    if (!me) return
    const { error } = await supabase.from("meeting_note_folders").insert({ workspace_id: wsId as string, name, created_by: me })
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
    // new_folder는 uuid(nullable) — SQL 함수가 NULL을 "미분류로" 명시 처리(non-STRICT). 생성 타입이 이를 반영 못 해 캐스팅.
    const results = await Promise.all(
      ids.map((id) => supabase.rpc("set_meeting_note_folder", { note_id: id, new_folder: folderId as string }))
    )
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
    if (editLoading) return <Loading rows={5} />
    return (
      <MeetingEditor
        note={editing}
        me={me}
        isAdmin={isAdmin}
        authorName={editing ? names[editing.user_id] : undefined}
        authorPosition={editing ? positions[editing.user_id] : undefined}
        names={names}
        onBack={backToList}
        onSaved={afterChange}
        onDeleted={afterChange}
        onOpenNote={(id) => void openNote({ id })}
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
            회의록을 작성하고 팀과 공유하세요.{" "}
            <span className="sm:hidden">폴더를 탭해 열어보세요.</span>
            <span className="hidden sm:inline">폴더를 더블클릭해 열고, 회의록을 끌어다 정리하세요.</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="relative hidden items-center sm:flex">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="회의록 검색"
              className="h-8 w-44 rounded-lg border border-border bg-card pl-8 pr-7 text-sm outline-none transition-[width] focus-visible:w-56 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            {searchQ && (
              <button onClick={() => setSearchQ("")} className="absolute right-2 text-muted-foreground hover:text-foreground" aria-label="검색 지우기">
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <Button size="sm" variant="outline" onClick={() => setChatOpen(true)}>
            <MessageCircleQuestion className="size-3.5" /> 창고에 질문
          </Button>
          <Button size="sm" onClick={() => openNote(null)}>
            <Plus className="size-3.5" /> 새 회의록
          </Button>
        </div>
      </div>

      {/* 검색 결과(P2) — 검색 중엔 목록 대신 결과만(스니펫과 함께). 지우면 원래 화면 복귀. */}
      {searchResults !== null && (
        <div className="flex flex-col gap-1.5">
          {searchResults.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">&lsquo;{searchQ.trim()}&rsquo; 검색 결과가 없어요.</p>
          ) : (
            searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => void openNote({ id: r.id })}
                className="rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{r.title}</span>
                  {r.meeting_date && <span className="text-[11px] text-muted-foreground">{r.meeting_date}</span>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{r.snippet}</p>
              </button>
            ))
          )}
        </div>
      )}

      {searchResults === null && (
      <>
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
          {/* 정렬을 토글 왼쪽에 — 표 모드에서 정렬이 사라져도 그리드/표 토글이 오른쪽 끝에 고정(자리 점프 방지) */}
          {currentFolder === null && listMode === "grid" && (
            <Select value={folderSort} onChange={(v) => setFolderSort(v as FolderSort)} options={SORT_OPTIONS} align="end" className="h-8" />
          )}
          <div className="inline-flex rounded-full bg-muted p-0.5 text-xs">
            {([
              ["grid", "그리드"],
              ["table", "표"],
              ["ideas", "아이디어"],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setListMode(mode)}
                className={cn(
                  "min-w-14 rounded-full px-3 py-1 text-center font-medium transition-colors",
                  listMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {listMode === "table" ? (
        <MeetingTable notes={notes} categories={categories} onOpen={openNote} onReload={load} />
      ) : listMode === "ideas" ? (
        me && <IdeasPanel me={me} onOpenNote={(id) => void openNote({ id })} />
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
            ? (
                <>
                  <span className="sm:hidden">폴더를 탭해 열어보세요.</span>
                  <span className="hidden sm:inline">폴더를 더블클릭해 열거나, 회의록을 폴더로 끌어다 놓으세요.</span>
                </>
              )
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
      </>
      )}

      {/* 창고에 질문(P2) — 회의록·아이디어 횡단 질의, 인용 클릭 시 제자리에서 열기 */}
      <MeetingsChat open={chatOpen} onClose={() => setChatOpen(false)} onOpenNote={(id) => void openNote({ id })} />
    </div>
  )
}
