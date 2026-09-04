"use client"

// 아이디어 캡처 다이얼로그 — 회의노트 대개편 P1 (MyMind 패턴: 정리는 사용자가 하지 않는다).
// 선택 텍스트(또는 빈 손)로 열림 → 제목·내용만 확인하고 저장. 저장은 낙관적(즉시 닫힘),
// 태그는 AI가 백그라운드에서 붙인다(/api/ideas/classify fire-and-forget — 실패해도 아이디어는 남는다).
import { useState } from "react"
import { toast } from "sonner"
import { Lightbulb, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentWorkspaceId } from "@/components/workspace/WorkspaceProvider"
import { Button } from "@/components/ui/button"
import { Modal, fieldClass } from "@/components/shared/Modal"

export function IdeaCaptureDialog({
  me,
  sourceNoteId,
  initialText,
  onClose,
  onSaved,
}: {
  me: string
  /** 회의노트 안에서 캡처하면 원문 점프용으로 연결(없으면 독립 캡처) */
  sourceNoteId: string | null
  initialText: string
  onClose: () => void
  onSaved?: () => void
}) {
  const supabase = createClient()
  const wsId = useCurrentWorkspaceId()
  const firstLine = initialText.split("\n").find((l) => l.trim()) ?? ""
  const [title, setTitle] = useState(firstLine.slice(0, 120))
  const [body, setBody] = useState(initialText.trim())
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const t = title.trim()
    if (!t) {
      toast.error("아이디어를 한 줄로 적어 주세요.")
      return
    }
    setBusy(true)
    const { data, error } = await supabase
      .from("ideas")
      .insert({
        workspace_id: wsId as string,
        created_by: me,
        title: t,
        body: body.trim(),
        source_note_id: sourceNoteId,
        source_snippet: initialText.trim().slice(0, 500) || null,
      })
      .select("id")
      .single()
    setBusy(false)
    if (error || !data) {
      toast.error(error?.message?.includes("Standard") ? error.message : "아이디어를 저장하지 못했어요.")
      return
    }
    toast.success("아이디어 창고에 담았어요. 태그는 AI가 붙이는 중…")
    onClose()
    onSaved?.()
    // 태그 분류는 백그라운드 — 기다리지 않는다(무끊김)
    void fetch("/api/ideas/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ideaId: data.id }),
    }).catch(() => {})
  }

  return (
    <Modal title="아이디어 창고에 담기" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2 rounded-lg bg-primary/5 px-2.5 py-2 text-[11px] text-muted-foreground">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>정리는 하지 않아도 돼요 — 분류 태그는 AI가 자동으로 붙이고, 나중에 창고에서 다시 떠올라요.</span>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          아이디어 한 줄
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 리필 파우치 구독 모델" className={fieldClass} autoFocus />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          메모 (선택)
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="맥락·근거·떠오른 배경 등"
            className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <div className="flex justify-end gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>취소</Button>
          <Button type="button" size="sm" onClick={save} disabled={busy || !title.trim()}>
            {busy && <Loader2 className="size-3.5 animate-spin" />} 담기
          </Button>
        </div>
      </div>
    </Modal>
  )
}
