"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Upload,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileArchive,
  File as FileIcon,
  Image as ImageIcon,
  Eye,
  Trash2,
  CloudUpload,
  ChevronRight,
  LayoutGrid,
  List,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { useUndo } from "@/components/undo/UndoProvider"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/shared/Select"
import { FolderGrid } from "@/components/shared/FolderGrid"
import { SelectCheck } from "@/components/shared/SelectCheck"
import { SelectionBar } from "@/components/shared/SelectionBar"
import { FilePreview } from "@/components/shared/FilePreview"
import { HoverPreview } from "@/components/shared/HoverPreview"
import { Loading, EmptyState, ErrorState } from "@/components/shared/States"
import { uploadFile } from "@/lib/upload"
import { FILES_BUCKET, fileSourceLabel, formatBytes } from "@/lib/files"

type Visibility = "personal" | "department" | "public"
type FileRow = {
  id: string
  name: string
  mime_type: string | null
  size_bytes: number | null
  source: string
  visibility: string
  folder_id: string | null
  metadata: { storage_path?: string } | null
  created_at: string
}
type FolderRow = { id: string; name: string; created_at: string }
type FolderSort = "name" | "recent" | "old" | "count"

const MAX_BYTES = 20 * 1024 * 1024 // 20MB
const SORT_OPTIONS = [
  { value: "name", label: "이름순" },
  { value: "recent", label: "최신순" },
  { value: "old", label: "오래된순" },
  { value: "count", label: "파일 많은순" },
]

// 공개범위 표시(라벨·배지). 가시성 자체는 RLS(마이그 044)가 강제 — 여기선 표시·필터만.
const VIS: Record<Visibility, { label: string; badge: string }> = {
  personal: { label: "개인", badge: "bg-muted text-muted-foreground" },
  department: { label: "부서", badge: "bg-blue-100 text-blue-700" },
  public: { label: "공개", badge: "bg-emerald-100 text-emerald-700" },
}
const TABS: { key: "all" | Visibility; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "public", label: "공개" },
  { key: "department", label: "부서" },
  { key: "personal", label: "개인" },
]

// 이미지 파일인지(실제 썸네일 대상).
function isImageFile(name: string, mime: string | null): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  return !!mime?.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(ext)
}

// 파일 종류별 아이콘·색 — 확장자/MIME로 판별(보기 쉽게).
function fileVisual(name: string, mime: string | null): { Icon: LucideIcon; color: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (isImageFile(name, mime)) return { Icon: ImageIcon, color: "text-violet-500" }
  if (ext === "pdf" || mime === "application/pdf") return { Icon: FileText, color: "text-red-500" }
  if (["xls", "xlsx", "csv"].includes(ext)) return { Icon: FileSpreadsheet, color: "text-emerald-600" }
  if (["ppt", "pptx"].includes(ext)) return { Icon: Presentation, color: "text-orange-500" }
  if (["doc", "docx", "hwp"].includes(ext)) return { Icon: FileText, color: "text-blue-500" }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { Icon: FileArchive, color: "text-amber-600" }
  return { Icon: FileIcon, color: "text-muted-foreground" }
}

// macOS Finder식 날짜 그룹 — 오늘 / 이전 7일 / 이전 30일 / 월별.
function dateBucket(iso: string, now: Date): { key: string; label: string; order: number } {
  const dayMs = 86400000
  const d = new Date(iso)
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.floor((startToday - startThat) / dayMs)
  if (diff <= 0) return { key: "today", label: "오늘", order: 0 }
  if (diff <= 7) return { key: "d7", label: "이전 7일", order: 1 }
  if (diff <= 30) return { key: "d30", label: "이전 30일", order: 2 }
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const label = y === now.getFullYear() ? `${m}월` : `${y}년 ${m}월`
  return { key: `${y}-${m}`, label, order: 3 + (9999 - y) * 12 + (12 - m) }
}

export function FilesView() {
  const supabase = createClient()
  const { push } = useUndo()
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<FileRow[]>([])
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [currentFolder, setCurrentFolder] = useState<string | null>(null) // null = 루트(전체)
  const [folderSort, setFolderSort] = useState<FolderSort>("name")
  const [rootOver, setRootOver] = useState(false) // breadcrumb '전체' 드롭 하이라이트
  const [view, setView] = useState<"list" | "icon">("list")
  const [sel, setSel] = useState<Set<string>>(new Set()) // 다중 선택된 파일 id
  const [myDept, setMyDept] = useState<string | null>(null)
  const [tab, setTab] = useState<"all" | Visibility>("all")
  const [uploadVis, setUploadVis] = useState<Visibility>("public")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<{ url: string; name: string; mime: string | null } | null>(null)

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        setLoading(false)
        return
      }
      // 일반 파일(프로젝트 미연결)만 — RLS가 본인 개인 + 공개 + 같은 부서만 돌려준다.
      const [{ data: prof }, { data, error: queryError }, { data: fdrs }] = await Promise.all([
        supabase.from("profiles").select("department").eq("id", auth.user.id).single(),
        supabase
          .from("files")
          .select("id, name, mime_type, size_bytes, source, visibility, folder_id, metadata, created_at")
          .is("project_id", null)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase.from("file_folders").select("id, name, created_at").order("created_at"),
      ])
      if (queryError) throw queryError
      setMyDept(prof?.department ?? null)
      setRows((data as FileRow[]) ?? [])
      setFolders((fdrs as FolderRow[]) ?? [])
      setError(null)
    } catch {
      setError("파일 목록을 불러오지 못했어요.")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    const h = () => load()
    window.addEventListener("equria:reload", h)
    return () => window.removeEventListener("equria:reload", h)
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

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (picked.length === 0) return
    const tooBig = picked.filter((f) => f.size > MAX_BYTES)
    const ok = picked.filter((f) => f.size <= MAX_BYTES)
    if (tooBig.length > 0) {
      toast.error(`20MB를 넘는 파일은 제외했어요: ${tooBig.map((f) => f.name).join(", ")}`)
    }
    if (ok.length === 0) return
    setUploading(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error("로그인이 필요합니다.")
      // 순차 업로드(스토리지) → 메타데이터는 한 번에 insert. 공개범위·내 부서·현재 폴더 기록.
      const newRows = []
      for (const file of ok) {
        const up = await uploadFile(FILES_BUCKET, file)
        newRows.push({
          source: "local",
          name: up.name,
          mime_type: up.mimeType,
          size_bytes: up.size,
          owner_id: auth.user.id,
          visibility: uploadVis,
          department: myDept,
          folder_id: currentFolder, // 현재 보고 있는 폴더에 바로 분류(루트면 미분류)
          metadata: { storage_path: up.path },
        })
      }
      await mustOk(supabase.from("files").insert(newRows))
      toast.success(`${newRows.length}개 업로드했어요.`)
      load()
    } catch {
      toast.error("업로드에 실패했어요.")
    } finally {
      setUploading(false)
    }
  }

  // 서명 URL(60초) — 호버/클릭 미리보기 공용.
  // 서명 URL은 서버 BFF 경유 — files 버킷이 '본인 폴더만'이라(015) 공유된 남의 파일은
  // 클라가 직접 못 서명. 서버가 RLS로 인가 후 admin으로 서명한다(/api/files/signed-url).
  const signedUrlFor = useCallback(async (f: FileRow): Promise<string | null> => {
    if (!f.metadata?.storage_path) return null
    const res = await fetch("/api/files/signed-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: f.id }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { url?: string }
    return json.url ?? null
  }, [])

  // 파일 클릭 → 새 탭 대신 인라인 미리보기 칸으로.
  const openPreview = async (f: FileRow) => {
    const url = await signedUrlFor(f)
    if (!url) {
      toast.error("미리보기 링크 생성에 실패했어요.")
      return
    }
    setPreview({ url, name: f.name, mime: f.mime_type })
  }

  const remove = async (f: FileRow) => {
    const now = new Date().toISOString()
    push({
      label: "파일 삭제",
      undo: async () => {
        await mustOk(supabase.from("files").update({ deleted_at: null }).eq("id", f.id))
        window.dispatchEvent(new Event("equria:reload"))
      },
      redo: async () => {
        await mustOk(supabase.from("files").update({ deleted_at: now }).eq("id", f.id))
        window.dispatchEvent(new Event("equria:reload"))
      },
    })
    await mustOk(supabase.from("files").update({ deleted_at: now }).eq("id", f.id))
    window.dispatchEvent(new Event("equria:reload"))
  }

  const createFolder = async (name: string) => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { error: e } = await supabase.from("file_folders").insert({ name, created_by: auth.user.id })
    if (e) return toast.error("폴더를 만들지 못했어요.")
    toast.success("폴더를 만들었어요.")
    load()
  }

  const renameFolder = async (id: string, name: string) => {
    // RLS(ff_update)가 만든 사람·대표·관리자만 허용 → 0행이면 권한 없음.
    const { data, error: e } = await supabase.from("file_folders").update({ name }).eq("id", id).select("id")
    if (e || !data?.length) return toast.error("이름을 바꾸지 못했어요. (만든 사람·대표·관리자만 가능)")
    load()
  }

  const deleteFolder = async (id: string) => {
    const f = folders.find((x) => x.id === id)
    if (!confirm(`'${f?.name ?? "폴더"}' 폴더를 삭제할까요? 안의 파일은 '미분류'로 남아요.`)) return
    const { error: e, count } = await supabase.from("file_folders").delete({ count: "exact" }).eq("id", id)
    if (e || !count) return toast.error("삭제하지 못했어요. (만든 사람·대표·관리자만 가능)")
    if (currentFolder === id) setCurrentFolder(null)
    toast.success("폴더를 삭제했어요.")
    load()
  }

  // 여러 파일을 한 번에 폴더로 이동(드래그 묶음·이동 바·드롭다운 공용).
  const moveFiles = async (ids: string[], folderId: string | null) => {
    if (ids.length === 0) return
    const results = await Promise.all(ids.map((id) => supabase.rpc("set_file_folder", { p_file: id, p_folder: folderId })))
    const failed = results.filter((r) => r.error).length
    if (failed) toast.error(`${failed}개는 옮기지 못했어요. (소유자·대표·관리자만 가능)`)
    if (failed < ids.length) toast.success(`${ids.length - failed}개 옮겼어요.`)
    clearSel()
    load()
  }

  // 드래그 시작: 선택된 묶음에 포함되면 묶음 전체, 아니면 그 한 개를 콤마로 싣는다.
  const dragIdsFor = (id: string) => (sel.has(id) && sel.size > 0 ? [...sel] : [id])
  const startDrag = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", dragIdsFor(id).join(","))
    e.dataTransfer.effectAllowed = "move"
  }

  // 루트(currentFolder=null)면 미분류(folder_id null), 폴더 안이면 그 폴더 파일 + 공개범위 탭 필터.
  const inScope = rows.filter((f) => (currentFolder === null ? !f.folder_id : f.folder_id === currentFolder))
  const visible = tab === "all" ? inScope : inScope.filter((f) => f.visibility === tab)
  const countOf = (fid: string) => rows.filter((f) => f.folder_id === fid).length
  const sortedFolders = [...folders].sort((a, b) => {
    if (folderSort === "name") return a.name.localeCompare(b.name, "ko")
    if (folderSort === "recent") return b.created_at.localeCompare(a.created_at)
    if (folderSort === "old") return a.created_at.localeCompare(b.created_at)
    return countOf(b.id) - countOf(a.id)
  })
  const gridItems = sortedFolders.map((f) => ({ id: f.id, name: f.name, count: countOf(f.id) }))
  const currentName = folders.find((f) => f.id === currentFolder)?.name
  // 폴더 안은 항상 아이콘 그리드(맥북 폴더창), 루트(미분류)에서만 토글 적용.
  const effectiveView = currentFolder === null ? view : "icon"
  // 컨트롤은 의미 있을 때만 노출(깔끔). 공개범위 필터=2종 이상일 때(또는 필터 켜진 상태),
  // 폴더 정렬=폴더 2개 이상, 리스트/아이콘 토글=루트에 낱개 파일 있을 때.
  const visibilityVaries = new Set(rows.map((r) => r.visibility)).size > 1
  const hasLoose = rows.some((r) => !r.folder_id)

  // 날짜별 그룹(오늘/이전 7일/이전 30일/월별) — visible은 이미 created_at desc 정렬.
  const now = new Date()
  const dateGroups: { key: string; label: string; order: number; items: FileRow[] }[] = []
  const groupMap = new Map<string, { label: string; order: number; items: FileRow[] }>()
  for (const f of visible) {
    const b = dateBucket(f.created_at, now)
    let g = groupMap.get(b.key)
    if (!g) {
      g = { label: b.label, order: b.order, items: [] }
      groupMap.set(b.key, g)
    }
    g.items.push(f)
  }
  for (const [key, g] of groupMap) dateGroups.push({ key, ...g })
  dateGroups.sort((a, b) => a.order - b.order)

  // 업로드 공개범위 옵션 — '부서'는 내 부서가 있을 때만
  const visOptions = [
    { value: "public", label: "공개(전체)" },
    ...(myDept ? [{ value: "department", label: `부서(${myDept})` }] : []),
    { value: "personal", label: "개인" },
  ]
  const moveOptions = [{ value: "none", label: "미분류" }, ...folders.map((f) => ({ value: f.id, label: f.name }))]

  // 리스트 한 줄
  const listRow = (f: FileRow) => {
    const vis = VIS[f.visibility as Visibility]
    const checked = sel.has(f.id)
    const { Icon, color } = fileVisual(f.name, f.mime_type)
    return (
      <div
        key={f.id}
        draggable
        onDragStart={(e) => startDrag(e, f.id)}
        className={cn("group flex cursor-grab items-center gap-3 px-4 py-3 transition-colors active:cursor-grabbing", checked && "bg-primary/5")}
      >
        <SelectCheck checked={checked} onToggle={() => toggleSel(f.id)} />
        <button onClick={() => openPreview(f)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {/* 호버 미리보기는 썸네일 위에서만(이름/메타에선 안 뜸) */}
          <HoverPreview getUrl={() => signedUrlFor(f)} name={f.name} mime={f.mime_type} className="block shrink-0">
            <div className="flex size-9 items-center justify-center rounded-md border bg-muted/20">
              <Icon className={cn("size-5", color)} strokeWidth={1.75} />
            </div>
          </HoverPreview>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium hover:underline">{f.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {fileSourceLabel(f.source)} · {formatBytes(f.size_bytes)}
            </span>
          </div>
        </button>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", vis?.badge ?? "bg-muted text-muted-foreground")}>
          {vis?.label ?? f.visibility}
        </span>
        {/* 액션은 평소 숨김 → hover 시에만(깔끔하게). 이동은 드래그·선택 이동바로. */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={() => openPreview(f)} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="미리보기" title="미리보기">
            <Eye className="size-4" />
          </button>
          <button onClick={() => remove(f)} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="삭제" title="삭제">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    )
  }

  // 아이콘 타일 하나
  const iconTile = (f: FileRow) => {
    const checked = sel.has(f.id)
    const { Icon, color } = fileVisual(f.name, f.mime_type)
    return (
      <div
        key={f.id}
        draggable
        onDragStart={(e) => startDrag(e, f.id)}
        className={cn("group relative w-24 cursor-grab rounded-2xl p-1 transition-colors active:cursor-grabbing", checked && "bg-primary/10")}
      >
        <SelectCheck checked={checked} onToggle={() => toggleSel(f.id)} className="absolute left-1 top-1 z-10" />
        <button onDoubleClick={() => openPreview(f)} title="더블클릭으로 열기" className="flex w-full flex-col items-center">
          {/* 호버 미리보기는 아이콘(썸네일) 위에서만 */}
          <HoverPreview getUrl={() => signedUrlFor(f)} name={f.name} mime={f.mime_type} className="block w-full">
            <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-muted/50 transition-colors group-hover:bg-muted">
              <Icon className={cn("size-9", color)} strokeWidth={1.5} />
            </div>
          </HoverPreview>
          <span className="mt-1 w-full truncate px-0.5 text-center text-xs font-medium" title={f.name}>
            {f.name}
          </span>
          <span className="text-[10px] text-muted-foreground">{formatBytes(f.size_bytes)}</span>
        </button>
        <button
          onClick={() => remove(f)}
          className="absolute right-1 top-1 rounded bg-background/80 p-0.5 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-destructive group-hover:opacity-100"
          aria-label="삭제"
          title="삭제"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">파일 관리</h1>
          <p className="text-sm text-muted-foreground">
            폴더를 더블클릭해 열고, 파일을 폴더에 끌어다 놓아 정리하세요. (여러 개 선택 후 한 번에 이동 가능)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={uploadVis} onChange={(v) => setUploadVis(v as Visibility)} options={visOptions} align="end" />
          <Button size="sm" className="h-8" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload /> {uploading ? "업로드 중…" : "파일 업로드"}
          </Button>
        </div>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={onFile} />
      </div>

      {/* 경로(breadcrumb) + 정렬 + 보기 토글 */}
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
              if (ids.length) moveFiles(ids, null) // 루트로 드롭 = 미분류로 빼기
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
        <div className="flex items-center gap-2">
          {/* 공개범위 필터 — 공개범위가 2종 이상(또는 필터 켜짐)일 때만 의미 있음 */}
          {(visibilityVaries || tab !== "all") && (
            <Select
              value={tab}
              onChange={(v) => {
                setTab(v as "all" | Visibility)
                clearSel()
              }}
              options={TABS.map((t) => ({ value: t.key, label: t.label }))}
              align="end"
              className="h-8"
            />
          )}
          {/* 폴더 정렬 — 폴더 2개 이상일 때만 */}
          {currentFolder === null && folders.length > 1 && (
            <Select value={folderSort} onChange={(v) => setFolderSort(v as FolderSort)} options={SORT_OPTIONS} align="end" className="h-8" />
          )}
          {/* 리스트/아이콘 토글 — 루트에 낱개 파일이 있을 때만(폴더 안은 항상 아이콘) */}
          {currentFolder === null && hasLoose && (
            <div className="flex h-8 items-center gap-0.5 rounded-lg border p-0.5">
              {([
                { k: "list", icon: List, label: "리스트" },
                { k: "icon", icon: LayoutGrid, label: "아이콘" },
              ] as const).map(({ k, icon: Icon, label }) => (
                <button
                  key={k}
                  onClick={() => setView(k)}
                  aria-label={label}
                  title={label}
                  className={cn("rounded-md p-1.5 transition-colors", view === k ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 루트에서만 폴더 그리드 (flat — 폴더 안 폴더 없음) */}
      {currentFolder === null && !loading && !error && (
        <FolderGrid
          folders={gridItems}
          onOpen={(id) => goFolder(id)}
          onCreate={createFolder}
          onRename={renameFolder}
          onDelete={deleteFolder}
          onDropItems={(ids, folderId) => moveFiles(ids, folderId)}
        />
      )}

      {/* 다중 선택 = 화면 안 밀리는 하단 플로팅 바 */}
      <SelectionBar count={sel.size} moveOptions={moveOptions} onMove={(fid) => moveFiles([...sel], fid)} onClear={clearSel} />

      {/* 파일 영역 — 날짜별 그룹(오늘/이전 7일/이전 30일/월별) */}
      {loading ? (
        <Loading rows={5} />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null)
            load()
          }}
        />
      ) : visible.length === 0 ? (
        currentFolder === null && folders.length > 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">폴더를 더블클릭해 열거나, 파일을 폴더로 끌어다 놓으세요.</p>
        ) : (
          <EmptyState
            icon={FileText}
            title={
              rows.length === 0
                ? "아직 업로드한 파일이 없어요."
                : currentFolder === null
                  ? "낱개(미분류) 파일이 없어요."
                  : "이 폴더에 파일이 없어요."
            }
          />
        )
      ) : (
        <div className="flex flex-col gap-5">
          {dateGroups.map((g) => (
            <div key={g.key} className="flex flex-col gap-2">
              <h3 className="px-1 text-xs font-semibold text-muted-foreground">{g.label}</h3>
              {effectiveView === "list" ? (
                <div className="flex flex-col divide-y rounded-xl border">{g.items.map(listRow)}</div>
              ) : (
                <div className="flex flex-wrap gap-3">{g.items.map(iconTile)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Google Drive 연동 게이트 (루트에만) */}
      {currentFolder === null && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed p-4">
          <CloudUpload className="size-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">Google Drive 연동</p>
            <p className="text-xs text-muted-foreground">연결하면 Drive 파일을 함께 볼 수 있어요. (준비 중)</p>
          </div>
          <Button size="sm" variant="outline" disabled>
            연결 (곧)
          </Button>
        </div>
      )}

      {preview && <FilePreview url={preview.url} name={preview.name} mime={preview.mime} onClose={() => setPreview(null)} />}
    </div>
  )
}
