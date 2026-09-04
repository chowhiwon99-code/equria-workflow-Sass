"use client"

// 전사 패널 — 회의노트 대개편 P1. ① 붙여넣기에서 감지된 전사의 저장/삽입 선택 배너
// ② 저장된 전사 요약 칩 + 접이식 세그먼트 + 화자명 일괄 치환 ③ 메모 완성(Enhance, Granola 패턴):
// 내 메모 골격 + 전사 보강을 스트리밍 미리보기 → [추가]/[교체]. 자동 실행 없음(명시적 버튼).
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { AudioLines, ChevronDown, ChevronRight, Loader2, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react"
import type { Editor } from "@tiptap/react"
import { Button } from "@/components/ui/button"
import {
  detectAndParseTranscript,
  transcriptSpeakers,
  transcriptToText,
  type ParsedTranscript,
} from "@/lib/transcript"
import { linesToContent, mdToContent } from "./meetingContent"

const SOURCE_LABEL: Record<ParsedTranscript["source"], string> = {
  vtt: "자막(VTT)",
  clova: "클로바노트",
  plain: "대화 텍스트",
}

export function TranscriptPanel({
  canEdit,
  transcript,
  setTranscript,
  pendingRaw,
  setPendingRaw,
  editorRef,
  meta,
}: {
  canEdit: boolean
  transcript: ParsedTranscript | null
  setTranscript: (t: ParsedTranscript | null) => void
  /** 에디터 붙여넣기에서 감지돼 대기 중인 원문(배너로 선택 대기) */
  pendingRaw: string | null
  setPendingRaw: (raw: string | null) => void
  editorRef: React.MutableRefObject<Editor | null>
  /** Enhance에 넘길 회의 정보 한 줄(제목·날짜·참석자) */
  meta: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [enhanceBusy, setEnhanceBusy] = useState(false)
  const [enhanceResult, setEnhanceResult] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  if (!canEdit) return null

  const acceptPending = () => {
    if (!pendingRaw) return
    const parsed = detectAndParseTranscript(pendingRaw)
    if (!parsed) {
      toast.error("전사 형식을 해석하지 못했어요.")
      setPendingRaw(null)
      return
    }
    setTranscript(parsed)
    setPendingRaw(null)
    toast.success(`전사를 보관했어요 (${parsed.segments.length}개 발화). 저장을 눌러야 노트에 남아요.`)
  }
  const insertPendingAsText = () => {
    if (!pendingRaw) return
    editorRef.current?.chain().focus("end").insertContent(linesToContent(pendingRaw)).run()
    setPendingRaw(null)
  }

  const renameSpeaker = (from: string) => {
    if (!transcript) return
    const to = window.prompt(`'${from}'을(를) 누구로 바꿀까요?`, from)
    if (!to || to.trim() === from) return
    setTranscript({
      ...transcript,
      segments: transcript.segments.map((s) => (s.speaker === from ? { ...s, speaker: to.trim() } : s)),
    })
  }

  const runEnhance = async () => {
    if (!transcript || enhanceBusy) return
    const notes = editorRef.current?.getText().trim() ?? ""
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setEnhanceBusy(true)
    setEnhanceResult("")
    try {
      const res = await fetch("/api/meeting-notes/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.slice(0, 12000), transcript: transcriptToText(transcript), meta }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        throw new Error(res.status === 429 ? await res.text() : `메모 완성에 실패했어요 (${res.status})`)
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let acc = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += dec.decode(value, { stream: true })
        setEnhanceResult(acc)
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      toast.error((e as Error).message || "메모 완성에 실패했어요.")
      setEnhanceResult(null)
    } finally {
      setEnhanceBusy(false)
      abortRef.current = null
    }
  }
  const closeEnhance = () => {
    abortRef.current?.abort()
    setEnhanceResult(null)
  }
  const enhanceAppend = () => {
    const r = enhanceResult?.trim()
    if (r) editorRef.current?.chain().focus("end").insertContent(mdToContent(r)).run()
    closeEnhance()
  }
  const enhanceReplace = () => {
    const r = enhanceResult?.trim()
    if (!r) return closeEnhance()
    if (editorRef.current && editorRef.current.getText().trim() && !confirm("현재 본문을 완성본으로 덮어쓸까요? 기존 내용은 사라집니다.")) return
    editorRef.current?.commands.setContent({ type: "doc", content: mdToContent(r) })
    closeEnhance()
  }

  const speakers = transcript ? transcriptSpeakers(transcript) : []

  return (
    <>
      {/* ① 붙여넣기 감지 배너 — 기본 삽입을 막았으니 반드시 선택지를 준다 */}
      {pendingRaw && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <AudioLines className="size-3.5 shrink-0 text-primary" />
          <span className="flex-1">
            붙여넣은 내용이 <b>회의 전사</b>로 보여요. 전사로 보관하면 <b>메모 완성</b>(내 메모 + 전사 병합)을 쓸 수 있어요.
          </span>
          <div className="flex shrink-0 gap-1.5">
            <Button type="button" size="sm" onClick={acceptPending}>전사로 보관</Button>
            <Button type="button" size="sm" variant="outline" onClick={insertPendingAsText}>그냥 본문에 붙여넣기</Button>
            <button onClick={() => setPendingRaw(null)} className="text-muted-foreground hover:text-foreground" aria-label="취소">
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ② 보관된 전사 + ③ 메모 완성 */}
      {transcript && (
        <div className="mt-2 rounded-lg border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              <AudioLines className="size-3.5" /> 전사 · {SOURCE_LABEL[transcript.source]} · 발화 {transcript.segments.length}개
              {speakers.length > 0 && ` · 화자 ${speakers.length}명`}
            </button>
            <span className="flex-1" />
            <Button type="button" size="sm" onClick={runEnhance} disabled={enhanceBusy}>
              {enhanceBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} 메모 완성
            </Button>
            <button
              type="button"
              onClick={() => confirm("보관된 전사를 삭제할까요? (본문은 그대로 둡니다)") && setTranscript(null)}
              className="text-muted-foreground transition-colors hover:text-destructive"
              aria-label="전사 삭제"
              title="전사 삭제"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>

          {speakers.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted-foreground">화자:</span>
              {speakers.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => renameSpeaker(sp)}
                  title="클릭해서 이름 바꾸기 (전체 일괄)"
                  className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {sp}
                </button>
              ))}
            </div>
          )}

          {expanded && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md bg-background/60 p-2">
              {transcript.segments.map((s, i) => (
                <p key={i} className="py-0.5 text-xs leading-relaxed">
                  {(s.speaker || s.ts) && (
                    <span className="mr-1.5 font-medium text-muted-foreground">
                      {[s.speaker, s.ts].filter(Boolean).join(" ")}
                    </span>
                  )}
                  {s.text}
                </p>
              ))}
            </div>
          )}

          {enhanceResult !== null && (
            <div className="mt-2 rounded-md border bg-background/60 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">완성본 미리보기 — 내 메모 골격 + 전사 보강</span>
                <button onClick={closeEnhance} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm">
                {enhanceResult || <span className="text-muted-foreground">완성하는 중…</span>}
              </div>
              <div className="mt-2 flex justify-end gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={enhanceAppend} disabled={enhanceBusy || !enhanceResult.trim()}>
                  <Plus className="size-3.5" /> 본문에 추가
                </Button>
                <Button type="button" size="sm" onClick={enhanceReplace} disabled={enhanceBusy || !enhanceResult.trim()}>
                  <RefreshCw className="size-3.5" /> 전체 교체
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
