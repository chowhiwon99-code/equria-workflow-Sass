"use client"

// AI 보조 패널 — MeetingEditor 분해(P0). 요약/액션아이템/정리 3버튼 + 스트리밍 미리보기 → [추가]/[교체].
// useMeetingAi 훅과 본문 반영까지 이 컴포넌트가 소유한다(editorRef만 부모에서 받음).
import { Sparkles, Loader2, Plus, RefreshCw, X, Search } from "lucide-react"
import type { Editor } from "@tiptap/react"
import { Button } from "@/components/ui/button"
import { useMeetingAi, AI_ACTION_LABEL, type AiAction } from "./useMeetingAi"
import { linesToContent } from "./meetingContent"

const AI_ACTIONS: AiAction[] = ["summarize", "actions", "polish"]

export function AiAssistPanel({
  editorRef,
  disabled,
  onToggleResearch,
}: {
  editorRef: React.MutableRefObject<Editor | null>
  disabled: boolean
  onToggleResearch: () => void
}) {
  const ai = useMeetingAi(() => editorRef.current?.getText() ?? "")

  const aiAppend = () => {
    const r = ai.result?.trim()
    if (r) editorRef.current?.chain().focus("end").insertContent(linesToContent(r)).run()
    ai.close()
  }
  const aiReplace = () => {
    const r = ai.result?.trim()
    if (!r) {
      ai.close()
      return
    }
    if (editorRef.current && editorRef.current.getText().trim() && !confirm("현재 본문을 AI 결과로 덮어쓸까요? 기존 내용은 사라집니다.")) return
    editorRef.current?.commands.setContent({ type: "doc", content: linesToContent(r) })
    ai.close()
  }

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Sparkles className="size-3" /> AI
        </span>
        {AI_ACTIONS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => ai.run(a)}
            disabled={disabled || ai.busy}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {ai.busy && ai.active === a && <Loader2 className="size-3 animate-spin" />}
            {AI_ACTION_LABEL[a]}
          </button>
        ))}
        <button
          type="button"
          onClick={onToggleResearch}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2.5 py-0.5 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
        >
          <Search className="size-3" /> 리서치
        </button>
        <span className="text-[11px] text-muted-foreground/70">· 본문에서 <kbd className="rounded bg-muted px-1">/</kbd> 입력</span>
      </div>

      {ai.result !== null && (
        <div className="mt-2 rounded-lg border bg-muted/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">
              {ai.active ? AI_ACTION_LABEL[ai.active] : ""} 결과 (미리보기)
            </span>
            <button onClick={ai.close} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-sm">
            {ai.result || <span className="text-muted-foreground">생성 중…</span>}
          </div>
          <div className="mt-2.5 flex justify-end gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={aiAppend} disabled={ai.busy || !ai.result.trim()}>
              <Plus className="size-3.5" /> 본문에 추가
            </Button>
            <Button type="button" size="sm" onClick={aiReplace} disabled={ai.busy || !ai.result.trim()}>
              <RefreshCw className="size-3.5" /> 전체 교체
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
