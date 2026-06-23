"use client"

import { useState } from "react"
import { Folder, FolderPlus, Trash2, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"

export type FolderGridItem = { id: string; name: string; count: number }

/**
 * macOS Finder식 폴더 그리드 — 라운드 사각 타일(테두리 없음·중립색), 더블클릭 진입,
 * 드래그 드롭 대상(여러 항목 한 번에), hover 이름변경/삭제.
 * 도메인 무관(데이터+콜백만) → 파일·회의노트·명함 공용.
 * 드롭 페이로드 = dataTransfer "text/plain" 에 항목 id를 콤마로 이어 싣는다(다중 이동).
 */
export function FolderGrid({
  folders,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onDropItems,
}: {
  folders: FolderGridItem[]
  onOpen: (id: string) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onDropItems: (itemIds: string[], folderId: string) => void
}) {
  const [newName, setNewName] = useState("")
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)

  const submitNew = () => {
    const n = newName.trim()
    if (n) onCreate(n)
    setNewName("")
    setAdding(false)
  }
  const submitRename = () => {
    if (!renaming) return
    const n = renaming.name.trim()
    if (n) onRename(renaming.id, n)
    setRenaming(null)
  }

  return (
    <div className="flex flex-wrap gap-3">
      {folders.map((f) => (
        <FolderTile
          key={f.id}
          folder={f}
          renaming={renaming?.id === f.id ? renaming.name : null}
          onOpen={() => onOpen(f.id)}
          onDrop={(ids) => onDropItems(ids, f.id)}
          onStartRename={() => setRenaming({ id: f.id, name: f.name })}
          onRenameChange={(v) => setRenaming({ id: f.id, name: v })}
          onRenameSubmit={submitRename}
          onRenameCancel={() => setRenaming(null)}
          onDelete={() => onDelete(f.id)}
        />
      ))}

      {/* 새 폴더 타일 */}
      <div className="w-24">
        {adding ? (
          <>
            <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-dashed bg-muted/30">
              <Folder className="size-9 fill-muted text-muted-foreground/40" strokeWidth={1.5} />
            </div>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNew()
                if (e.key === "Escape") {
                  setAdding(false)
                  setNewName("")
                }
              }}
              onBlur={() => {
                if (!newName.trim()) setAdding(false)
              }}
              placeholder="폴더 이름"
              className="mt-1 w-full rounded border bg-background px-1.5 py-0.5 text-center text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </>
        ) : (
          <button onClick={() => setAdding(true)} className="group/new w-full text-center">
            <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-dashed text-muted-foreground/60 transition-colors group-hover/new:bg-muted/40 group-hover/new:text-foreground">
              <FolderPlus className="size-9" strokeWidth={1.5} />
            </div>
            <span className="mt-1 block truncate text-center text-xs font-medium text-muted-foreground">새 폴더</span>
          </button>
        )}
      </div>
    </div>
  )
}

function FolderTile({
  folder,
  renaming,
  onOpen,
  onDrop,
  onStartRename,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onDelete,
}: {
  folder: FolderGridItem
  renaming: string | null
  onOpen: () => void
  onDrop: (itemIds: string[]) => void
  onStartRename: () => void
  onRenameChange: (v: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
  onDelete: () => void
}) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const raw = e.dataTransfer.getData("text/plain")
        const ids = raw ? raw.split(",").filter(Boolean) : []
        if (ids.length) onDrop(ids)
      }}
      onDoubleClick={renaming === null ? onOpen : undefined}
      title={renaming === null ? "더블클릭으로 열기" : undefined}
      className="group relative w-24 cursor-pointer"
    >
      <div
        className={cn(
          "flex aspect-square w-full items-center justify-center rounded-2xl transition-colors",
          over ? "bg-primary/10 ring-2 ring-inset ring-primary" : "bg-muted/50 group-hover:bg-muted"
        )}
      >
        <Folder className="size-9 fill-muted-foreground/20 text-muted-foreground" strokeWidth={1.5} />
      </div>

      {renaming !== null ? (
        <input
          autoFocus
          value={renaming}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameSubmit()
            if (e.key === "Escape") onRenameCancel()
          }}
          onBlur={onRenameSubmit}
          onDoubleClick={(e) => e.stopPropagation()}
          className="mt-1 w-full rounded border bg-background px-1 py-0.5 text-center text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      ) : (
        <div className="mt-1 text-center">
          <span className="block truncate px-0.5 text-xs font-medium" title={folder.name}>
            {folder.name}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{folder.count}</span>
        </div>
      )}

      {/* hover 액션(이름변경/삭제) */}
      {renaming === null && (
        <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStartRename()
            }}
            className="rounded bg-background/80 p-0.5 text-muted-foreground backdrop-blur hover:text-foreground"
            aria-label={`${folder.name} 이름 변경`}
          >
            <Pencil className="size-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="rounded bg-background/80 p-0.5 text-muted-foreground backdrop-blur hover:text-destructive"
            aria-label={`${folder.name} 삭제`}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      )}
    </div>
  )
}
