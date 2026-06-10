"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Upload, FileText, Download, Trash2, CloudUpload } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { useUndo } from "@/components/undo/UndoProvider"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/shared/Select"
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
  metadata: { storage_path?: string } | null
  created_at: string
}

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
  const [myDept, setMyDept] = useState<string | null>(null)
  const [tab, setTab] = useState<"all" | Visibility>("all")
  const [uploadVis, setUploadVis] = useState<Visibility>("public")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        setLoading(false)
        return
      }
      // 일반 파일(프로젝트 미연결)만 — RLS가 본인 개인 + 공개 + 같은 부서만 돌려준다.
      const [{ data: prof }, { data, error: queryError }] = await Promise.all([
        supabase.from("profiles").select("department").eq("id", auth.user.id).single(),
        supabase
          .from("files")
          .select("id, name, mime_type, size_bytes, source, visibility, metadata, created_at")
          .is("project_id", null)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
      ])
      if (queryError) throw queryError
      setMyDept(prof?.department ?? null)
      setRows((data as FileRow[]) ?? [])
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
      // 순차 업로드(스토리지) → 메타데이터는 한 번에 insert. 선택한 공개범위·내 부서 기록.
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

  const download = async (f: FileRow) => {
    const path = f.metadata?.storage_path
    if (!path) {
      toast.error("파일 경로를 찾을 수 없어요.")
      return
    }
    const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(path, 60)
    if (error || !data) {
      toast.error("다운로드 링크 생성에 실패했어요.")
      return
    }
    window.open(data.signedUrl, "_blank")
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

  const visible = tab === "all" ? rows : rows.filter((f) => f.visibility === tab)
  // 업로드 공개범위 옵션 — '부서'는 내 부서가 있을 때만
  const visOptions = [
    { value: "public", label: "공개(전체)" },
    ...(myDept ? [{ value: "department", label: `부서(${myDept})` }] : []),
    { value: "personal", label: "개인" },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">파일 관리</h1>
          <p className="text-sm text-muted-foreground">공개범위를 골라 업로드하고, 분류별로 모아 보세요.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={uploadVis} onChange={(v) => setUploadVis(v as Visibility)} options={visOptions} align="end" />
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload /> {uploading ? "업로드 중…" : "파일 업로드"}
          </Button>
        </div>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={onFile} />
      </div>

      {/* 분류 탭 */}
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
          title={rows.length === 0 ? "아직 업로드한 파일이 없어요." : "이 분류에 파일이 없어요."}
        />
      ) : (
        <div className="flex flex-col divide-y rounded-xl border">
          {visible.map((f) => {
            const vis = VIS[f.visibility as Visibility]
            return (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{f.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {fileSourceLabel(f.source)} · {formatBytes(f.size_bytes)}
                  </span>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", vis?.badge ?? "bg-muted text-muted-foreground")}>
                  {vis?.label ?? f.visibility}
                </span>
                <button
                  onClick={() => download(f)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="다운로드"
                  title="다운로드"
                >
                  <Download className="size-4" />
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
  )
}
