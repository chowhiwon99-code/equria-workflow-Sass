"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Upload, FileText, Download, Trash2, CloudUpload } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { useUndo } from "@/components/undo/UndoProvider"
import { Button } from "@/components/ui/button"
import { uploadFile } from "@/lib/upload"
import { FILES_BUCKET, fileSourceLabel, formatBytes } from "@/lib/files"

type FileRow = {
  id: string
  name: string
  mime_type: string | null
  size_bytes: number | null
  source: string
  metadata: { storage_path?: string } | null
  created_at: string
}

const MAX_BYTES = 20 * 1024 * 1024 // 20MB

export function FilesView() {
  const supabase = createClient()
  const { push } = useUndo()
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<FileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from("files")
      .select("id, name, mime_type, size_bytes, source, metadata, created_at")
      .eq("owner_id", auth.user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
    setRows((data as FileRow[]) ?? [])
    setLoading(false)
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
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (file.size > MAX_BYTES) {
      toast.error("20MB 이하 파일만 업로드할 수 있어요.")
      return
    }
    setUploading(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error("로그인이 필요합니다.")
      const up = await uploadFile(FILES_BUCKET, file)
      await mustOk(
        supabase.from("files").insert({
          source: "local",
          name: up.name,
          mime_type: up.mimeType,
          size_bytes: up.size,
          owner_id: auth.user.id,
          metadata: { storage_path: up.path },
        })
      )
      toast.success("업로드했어요.")
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">파일 관리</h1>
          <p className="text-sm text-muted-foreground">파일을 업로드해 보관·공유하세요.</p>
        </div>
        <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <Upload /> {uploading ? "업로드 중…" : "파일 업로드"}
        </Button>
        <input ref={inputRef} type="file" className="hidden" onChange={onFile} />
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
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          아직 업로드한 파일이 없어요.
        </p>
      ) : (
        <div className="flex flex-col divide-y rounded-xl border">
          {rows.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{f.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {fileSourceLabel(f.source)} · {formatBytes(f.size_bytes)}
                </span>
              </div>
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
          ))}
        </div>
      )}
    </div>
  )
}
