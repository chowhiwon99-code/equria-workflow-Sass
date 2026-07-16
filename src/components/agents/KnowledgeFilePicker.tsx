"use client"

import { useRef, useState } from "react"
import { Paperclip, X, FileText, Loader2, Lock, Users } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  stageKnowledgeFile,
  isAiReadable,
  KNOWLEDGE_ACCEPT,
  KNOWLEDGE_MAX_BYTES,
  type StagedKnowledge,
} from "@/lib/agentKnowledge"

/** 지식파일 첨부 — AI가 읽을 수 있는 파일만 골라 스테이징(업로드)한다. 상위가 저장 시 agent_knowledge에 반영. */
export function KnowledgeFilePicker({
  value,
  onChange,
  className,
}: {
  value: StagedKnowledge[]
  onChange: (next: StagedKnowledge[]) => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    const staged: StagedKnowledge[] = []
    for (const f of Array.from(files)) {
      if (!isAiReadable(f)) {
        toast.error(`${f.name}: AI가 읽을 수 있는 형식이 아니에요 (PDF·이미지·txt/md/csv/json)`)
        continue
      }
      if (f.size > KNOWLEDGE_MAX_BYTES) {
        toast.error(`${f.name}: 20MB를 초과했어요`)
        continue
      }
      try {
        staged.push(await stageKnowledgeFile(f))
      } catch {
        toast.error(`${f.name}: 업로드 실패`)
      }
    }
    if (staged.length) onChange([...value, ...staged])
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={KNOWLEDGE_ACCEPT}
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 self-start rounded-full border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />} 파일 첨부
      </button>

      {value.length > 0 && (
        <div className="flex flex-col gap-1">
          {value.map((f, i) => (
            <div
              key={f.storage_path}
              className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              {/* 개인 전용/공유 토글 — 개인 전용이면 공유 에이전트여도 올린 본인만 봄 */}
              <button
                type="button"
                onClick={() => onChange(value.map((v, j) => (j === i ? { ...v, is_personal: !v.is_personal } : v)))}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors",
                  f.is_personal ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                )}
                title={
                  f.is_personal
                    ? "나만 봄 — 공유 에이전트여도 비공개 (눌러서 공유로)"
                    : "이 에이전트를 쓰는 사람과 공유됨 (눌러서 개인 전용으로)"
                }
              >
                {f.is_personal ? <Lock className="size-3" /> : <Users className="size-3" />}
                {f.is_personal ? "개인 전용" : "공유"}
              </button>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                aria-label={`${f.name} 제거`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/70">
        AI가 읽을 수 있는 파일만 (PDF·이미지·txt/md/csv/json, 20MB 이하). 대화 시 참고자료로 함께 읽어요.
      </p>
    </div>
  )
}
