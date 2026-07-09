"use client"

import { useState } from "react"
import { Folder, FolderPlus, Trash2, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"

export type FolderGridItem = { id: string; name: string; count: number }

/** 폴더 이름 입력(추가/이름변경 공용) — Enter=커밋, Escape=취소, blur는 submitOnBlur(이름변경) 또는 비었을 때만 닫기(추가). */
function FolderNameInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitOnBlur = false,
  placeholder,
  className,
  onDoubleClick,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
  submitOnBlur?: boolean
  placeholder?: string
  className?: string
  onDoubleClick?: (e: React.MouseEvent) => void
}) {
  return (
    <input
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmit()
        if (e.key === "Escape") onCancel()
      }}
      onBlur={() => {
        if (submitOnBlur) onSubmit()
        else if (!value.trim()) onCancel()
      }}
      onDoubleClick={onDoubleClick}
      className={className}
    />
  )
}

/**
 * macOS Finder식 폴더 그리드 — 라운드 사각 타일(테두리 없음·중립색), 더블클릭 진입,
 * 드래그 드롭 대상(여러 항목 한 번에), hover 이름변경/삭제.
 * 모바일(<sm)은 리스트형으로 전환 — 탭 한 번에 열림, 이름변경/삭제 상시 노출(터치엔 더블클릭·hover·DnD 없음).
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
  const cancelNew = () => {
    setAdding(false)
    setNewName("")
  }
  const submitRename = () => {
    if (!renaming) return
    const n = renaming.name.trim()
    if (n) onRename(renaming.id, n)
    setRenaming(null)
  }

  return (
    <>
      {/* 모바일(<sm): 리스트형 — 탭 한 번에 열림(터치엔 더블클릭·hover 없음), 액션 상시 노출 */}
      <div className="divide-y overflow-hidden rounded-2xl border bg-card sm:hidden">
        {folders.map((f) =>
          renaming?.id === f.id ? (
            <div key={f.id} className="flex items-center gap-3 px-3 py-3">
              <Folder className="size-5 shrink-0 fill-muted-foreground/20 text-muted-foreground" strokeWidth={1.5} />
              <FolderNameInput
                value={renaming.name}
                onChange={(v) => setRenaming({ id: f.id, name: v })}
                onSubmit={submitRename}
                onCancel={() => setRenaming(null)}
                submitOnBlur
                className="min-w-0 flex-1 rounded border bg-background px-1.5 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ) : (
            <div key={f.id} className="flex items-center gap-1 px-3 py-1.5">
              <button onClick={() => onOpen(f.id)} className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left">
                <Folder className="size-5 shrink-0 fill-muted-foreground/20 text-muted-foreground" strokeWidth={1.5} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{f.count}</span>
              </button>
              <button
                onClick={() => setRenaming({ id: f.id, name: f.name })}
                className="shrink-0 rounded-md p-2 text-muted-foreground"
                aria-label={`${f.name} 이름 변경`}
              >
                <Pencil className="size-3.5" />
              </button>
              <button onClick={() => onDelete(f.id)} className="shrink-0 rounded-md p-2 text-muted-foreground" aria-label={`${f.name} 삭제`}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )
        )}
        {adding ? (
          <div className="flex items-center gap-3 px-3 py-3">
            <FolderPlus className="size-5 shrink-0 text-muted-foreground/60" strokeWidth={1.5} />
            <FolderNameInput
              value={newName}
              onChange={setNewName}
              onSubmit={submitNew}
              onCancel={cancelNew}
              placeholder="폴더 이름"
              className="min-w-0 flex-1 rounded border bg-background px-1.5 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="flex w-full items-center gap-3 px-3 py-3 text-left text-muted-foreground">
            <FolderPlus className="size-5 shrink-0" strokeWidth={1.5} />
            <span className="text-sm font-medium">새 폴더</span>
          </button>
        )}
      </div>

      {/* 데스크톱(sm+): 기존 Finder식 그리드 그대로 */}
      <div className="hidden flex-wrap gap-3 sm:flex">
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
            <FolderNameInput
              value={newName}
              onChange={setNewName}
              onSubmit={submitNew}
              onCancel={cancelNew}
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
    </>
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
        <FolderNameInput
          value={renaming}
          onChange={onRenameChange}
          onSubmit={onRenameSubmit}
          onCancel={onRenameCancel}
          submitOnBlur
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
