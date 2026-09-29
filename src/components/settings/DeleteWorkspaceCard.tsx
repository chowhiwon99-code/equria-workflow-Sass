"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useWorkspace } from "@/components/workspace/WorkspaceProvider"
import { clearActiveWsCookie } from "@/lib/workspace-cookie"

/** 오너 전용 — 현재 워크스페이스 영구 삭제. 이름을 그대로 입력해야 버튼이 열린다(깃허브식 확인). */
export function DeleteWorkspaceCard() {
  const { currentWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)

  if (!currentWorkspace) return null
  const name = currentWorkspace.name
  const matches = typed.trim() === name.trim()

  const remove = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: typed.trim() }),
      })
      if (!res.ok) {
        toast.error((await res.text().catch(() => "")) || "삭제에 실패했어요.")
        return
      }
      clearActiveWsCookie()
      toast.success(`‘${name}’ 워크스페이스를 삭제했어요.`)
      // 전체 새로고침 — 워크스페이스 목록·RLS 스코프를 서버에서 다시 받는다(남은 회사가 없으면 온보딩으로).
      window.location.href = "/dashboard"
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          ‘{name}’의 채팅·파일·장부·회의록 등 모든 데이터가 영구 삭제되고 되돌릴 수 없어요.
        </p>
        <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
          삭제
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (matches && !busy) void remove()
      }}
      className="flex flex-col gap-2.5"
    >
      <p className="text-sm">
        확인을 위해 워크스페이스 이름 <span className="font-semibold">{name}</span>을(를) 입력하세요.
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={name}
        autoFocus
        aria-label="삭제할 워크스페이스 이름"
        className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-destructive"
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setOpen(false)
            setTyped("")
          }}
          disabled={busy}
        >
          취소
        </Button>
        <Button type="submit" size="sm" variant="destructive" disabled={!matches || busy}>
          {busy ? "삭제 중…" : "영구 삭제"}
        </Button>
      </div>
    </form>
  )
}
