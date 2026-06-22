"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Upload, FileText, Eye, Trash2, CloudUpload, Folder, FolderPlus } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { useUndo } from "@/components/undo/UndoProvider"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/shared/Select"
import { FolderSidebarItem } from "@/components/shared/FolderSidebarItem"
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
type FolderRow = { id: string; name: string }

const MAX_BYTES = 20 * 1024 * 1024 // 20MB

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

export function FilesView() {
  const supabase = createClient()
  const { push } = useUndo()
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<FileRow[]>([])
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [selected, setSelected] = useState<string>("all") // "all" | "none" | folderId
  const [newFolder, setNewFolder] = useState("")
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
        supabase.from("file_folders").select("id, name").order("sort").order("created_at"),
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
      // 순차 업로드(스토리지) → 메타데이터는 한 번에 insert. 선택한 공개범위·내 부서·현재 폴더 기록.
      const folderId = selected !== "all" && selected !== "none" ? selected : null
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
          folder_id: folderId,
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
  const signedUrlFor = useCallback(
    async (f: FileRow): Promise<string | null> => {
      const path = f.metadata?.storage_path
      if (!path) return null
      const { data } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(path, 60)
      return data?.signedUrl ?? null
    },
    [supabase]
  )

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

  const createFolder = async () => {
    const name = newFolder.trim()
    if (!name) return
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { error: e } = await supabase.from("file_folders").insert({ name, created_by: auth.user.id })
    if (e) return toast.error("폴더를 만들지 못했어요.")
    setNewFolder("")
    toast.success("폴더를 만들었어요.")
    load()
  }

  const deleteFolder = async (f: FolderRow) => {
    if (!confirm(`'${f.name}' 폴더를 삭제할까요? 안의 파일은 '미분류'로 남아요.`)) return
    const { error: e, count } = await supabase.from("file_folders").delete({ count: "exact" }).eq("id", f.id)
    if (e || !count) return toast.error("삭제하지 못했어요. (만든 사람·대표·관리자만 가능)")
    if (selected === f.id) setSelected("all")
    toast.success("폴더를 삭제했어요.")
    load()
  }

  const moveFile = async (fileId: string, folderId: string | null) => {
    const { error: e } = await supabase.rpc("set_file_folder", { p_file: fileId, p_folder: folderId })
    if (e) return toast.error("폴더로 옮기지 못했어요. (소유자·대표·관리자만 가능)")
    toast.success("폴더를 옮겼어요.")
    load()
  }

  const byFolder = rows.filter((f) =>
    selected === "all" ? true : selected === "none" ? !f.folder_id : f.folder_id === selected
  )
  const visible = tab === "all" ? byFolder : byFolder.filter((f) => f.visibility === tab)
  const noneCount = rows.filter((f) => !f.folder_id).length
  const countOf = (fid: string) => rows.filter((f) => f.folder_id === fid).length
  // 업로드 공개범위 옵션 — '부서'는 내 부서가 있을 때만
  const visOptions = [
    { value: "public", label: "공개(전체)" },
    ...(myDept ? [{ value: "department", label: `부서(${myDept})` }] : []),
    { value: "personal", label: "개인" },
  ]
  const moveOptions = [{ value: "none", label: "미분류" }, ...folders.map((f) => ({ value: f.id, label: f.name }))]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">파일 관리</h1>
          <p className="text-sm text-muted-foreground">공개범위를 골라 업로드하고, 폴더로 정리하세요. 파일을 폴더에 끌어다 놓을 수 있어요.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={uploadVis} onChange={(v) => setUploadVis(v as Visibility)} options={visOptions} align="end" />
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload /> {uploading ? "업로드 중…" : "파일 업로드"}
          </Button>
        </div>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={onFile} />
      </div>

      <div className="flex flex-col gap-5 sm:flex-row">
        {/* 폴더 사이드바 */}
        <aside className="flex shrink-0 flex-col gap-1 sm:w-48">
          <FolderSidebarItem label="전체" count={rows.length} active={selected === "all"} onClick={() => setSelected("all")} />
          <FolderSidebarItem
            label="미분류"
            count={noneCount}
            active={selected === "none"}
            onClick={() => setSelected("none")}
            onDropItem={(id) => moveFile(id, null)}
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
              onDropItem={(id) => moveFile(id, f.id)}
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

        {/* 오른쪽: 분류 탭 + Drive 게이트 + 목록 */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* 공개범위 분류 탭 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-sm transition-colors",
                  tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Google Drive 연동 게이트 */}
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

          {/* 파일 목록 */}
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
            <EmptyState
              icon={FileText}
              title={rows.length === 0 ? "아직 업로드한 파일이 없어요." : "이 폴더·분류에 파일이 없어요."}
            />
          ) : (
            <div className="flex flex-col divide-y rounded-xl border">
              {visible.map((f) => {
                const vis = VIS[f.visibility as Visibility]
                return (
                  <div
                    key={f.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", f.id)
                      e.dataTransfer.effectAllowed = "move"
                    }}
                    className="flex cursor-grab items-center gap-3 px-4 py-3 active:cursor-grabbing"
                  >
                    <HoverPreview getUrl={() => signedUrlFor(f)} name={f.name} mime={f.mime_type} className="flex min-w-0 flex-1">
                      <button onClick={() => openPreview(f)} className="flex w-full min-w-0 items-center gap-3 text-left">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium hover:underline">{f.name}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {fileSourceLabel(f.source)} · {formatBytes(f.size_bytes)}
                          </span>
                        </div>
                      </button>
                    </HoverPreview>
                    {folders.length > 0 && (
                      <Select
                        value={f.folder_id ?? "none"}
                        onChange={(v) => moveFile(f.id, v === "none" ? null : v)}
                        options={moveOptions}
                        align="end"
                        className="h-8"
                      />
                    )}
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", vis?.badge ?? "bg-muted text-muted-foreground")}>
                      {vis?.label ?? f.visibility}
                    </span>
                    <button
                      onClick={() => openPreview(f)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="미리보기"
                      title="미리보기"
                    >
                      <Eye className="size-4" />
                    </button>
                    <button
                      onClick={() => remove(f)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="삭제"
                      title="삭제"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {preview && <FilePreview url={preview.url} name={preview.name} mime={preview.mime} onClose={() => setPreview(null)} />}
    </div>
  )
}
