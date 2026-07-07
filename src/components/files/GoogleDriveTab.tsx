"use client"

import { useCallback, useEffect, useState } from "react"
import { Folder, Download, ExternalLink, Search, RefreshCw, File as FileIcon } from "lucide-react"
import { formatBytes } from "@/lib/files"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type DriveFile = {
  id: string
  name: string
  mimeType: string
  isFolder: boolean
  size: number | null
  modifiedTime: string | null
  iconLink: string | null
  webViewLink: string | null
}
type Crumb = { id: string | null; name: string }

// 폴더/검색 결과 캐시(stale-while-revalidate) — 재방문 시 즉시 표시 후 백그라운드 갱신.
const driveCache = new Map<string, DriveFile[]>()

/** Files 섹션의 Google Drive 탭 — 연동한 구글 계정의 드라이브를 목록·검색·폴더탐색·다운로드(읽기 전용). */
export default function GoogleDriveTab() {
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: "내 드라이브" }])
  const [files, setFiles] = useState<DriveFile[]>([])
  const [q, setQ] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [notConnected, setNotConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parentId = crumbs[crumbs.length - 1].id

  const load = useCallback(async () => {
    const key = search.trim() ? `q:${search.trim()}` : `p:${parentId ?? "root"}`
    const cached = driveCache.get(key)
    setError(null)
    setNotConnected(false)
    if (cached) {
      setFiles(cached) // 캐시 즉시 표시(뒤에서 갱신)
      setLoading(false)
    } else {
      setLoading(true)
    }
    const params = new URLSearchParams()
    if (search.trim()) params.set("q", search.trim())
    else if (parentId) params.set("parentId", parentId)
    try {
      const res = await fetch(`/api/google/drive/files?${params.toString()}`)
      if (res.status === 412) {
        setNotConnected(true)
        return
      }
      if (!res.ok) {
        if (!cached) setError("드라이브를 불러오지 못했어요.")
        return
      }
      const data = (await res.json()) as { files: DriveFile[] }
      driveCache.set(key, data.files ?? [])
      setFiles(data.files ?? [])
    } catch {
      if (!cached) setError("네트워크 오류가 발생했어요.")
    } finally {
      setLoading(false)
    }
  }, [parentId, search])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트/폴더변경 시 1회 드라이브 로드(외부 fetch)
    void load()
  }, [load])

  function openFolder(f: DriveFile) {
    setSearch("")
    setQ("")
    setCrumbs((c) => [...c, { id: f.id, name: f.name }])
  }
  function goCrumb(i: number) {
    setSearch("")
    setQ("")
    setCrumbs((c) => c.slice(0, i + 1))
  }

  if (notConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border bg-muted/20 py-16 text-center">
        <Folder className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Google Drive가 아직 연결되지 않았어요.</p>
        <Button onClick={() => { window.location.href = "/api/google/connect" }}>구글 연결하기</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={(e) => { e.preventDefault(); setSearch(q) }} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="드라이브 검색"
            className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {search && (
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => { setSearch(""); setQ("") }}>
            검색 해제
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void load()} aria-label="새로고침">
          <RefreshCw className="size-4" />
        </Button>
      </form>

      {!search && (
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <span key={`${c.id ?? "root"}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground">/</span>}
              <button
                onClick={() => goCrumb(i)}
                className={cn(
                  "rounded px-1.5 py-0.5 transition-colors",
                  i === crumbs.length - 1 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {c.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="overflow-hidden rounded-xl border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
              <div className="size-9 shrink-0 animate-pulse rounded-md bg-muted" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-1/5 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="py-16 text-center text-sm text-destructive">{error}</p>
      ) : files.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{search ? "검색 결과가 없어요." : "이 폴더가 비어있어요."}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          {files.map((f) => (
            <div key={f.id} className="group flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/40">
              <button
                onClick={() => (f.isFolder ? openFolder(f) : window.open(f.webViewLink ?? "#", "_blank"))}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-muted/20">
                  {f.isFolder ? (
                    <Folder className="size-4 text-muted-foreground" />
                  ) : f.iconLink ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.iconLink} alt="" className="size-4" />
                  ) : (
                    <FileIcon className="size-4 text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium hover:underline">{f.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {f.isFolder ? "폴더" : f.size ? formatBytes(f.size) : "Google 문서"}
                    {f.modifiedTime ? ` · ${new Date(f.modifiedTime).toLocaleDateString("ko-KR")}` : ""}
                  </span>
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {f.webViewLink && (
                  <a href={f.webViewLink} target="_blank" rel="noreferrer" className="rounded p-1 text-muted-foreground hover:text-foreground" title="Drive에서 열기">
                    <ExternalLink className="size-4" />
                  </a>
                )}
                {!f.isFolder && (
                  <a href={`/api/google/drive/download/${f.id}`} className="rounded p-1 text-muted-foreground hover:text-foreground" title="다운로드">
                    <Download className="size-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
