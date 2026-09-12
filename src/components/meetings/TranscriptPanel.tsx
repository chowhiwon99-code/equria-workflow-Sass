"use client"

// 전사 패널 — 회의노트 대개편 P1. ① 붙여넣기에서 감지된 전사의 저장/삽입 선택 배너
// ② 저장된 전사 요약 칩 + 접이식 세그먼트 + 화자명 일괄 치환 ③ 메모 완성(Enhance, Granola 패턴):
// 내 메모 골격 + 전사 보강을 스트리밍 미리보기 → [추가]/[교체]. 자동 실행 없음(명시적 버튼).
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AudioLines, ChevronDown, ChevronRight, Gavel, Loader2, MessageSquare, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react"
import type { Editor } from "@tiptap/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  detectAndParseTranscript,
  transcriptSpeakers,
  transcriptToText,
  type ParsedTranscript,
} from "@/lib/transcript"
import { maskPii, sliceRecent, SCOPE_LABEL, type KakaoScope } from "@/lib/kakao"
import type { DecisionDraft } from "./DecisionApprovalBanner"
import { linesToContent, mdToContent } from "./meetingContent"

const SOURCE_LABEL: Record<ParsedTranscript["source"], string> = {
  vtt: "자막(VTT)",
  clova: "클로바노트",
  plain: "대화 텍스트",
  kakao: "카카오톡",
}

const SCOPES: KakaoScope[] = ["today", "week", "all"]

export function TranscriptPanel({
  canEdit,
  transcript,
  setTranscript,
  pendingRaw,
  setPendingRaw,
  editorRef,
  meta,
  onChatDecisions,
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
  /** Unit C — 카톡에서 뽑은 결정 초안을 부모에 넘긴다(저장 후 승인 카드로 뜬다) */
  onChatDecisions?: (drafts: DecisionDraft[]) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [enhanceBusy, setEnhanceBusy] = useState(false)
  const [enhanceResult, setEnhanceResult] = useState<string | null>(null)
  const [scope, setScope] = useState<KakaoScope>("week")
  const [chatBusy, setChatBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  // 붙여넣은 원문이 카톡인지 — 배너 종류가 갈린다(전사 보관 vs 결정만 뽑기)
  const kakao = useMemo(() => {
    if (!pendingRaw) return null
    const parsed = detectAndParseTranscript(pendingRaw)
    return parsed?.source === "kakao" ? parsed : null
  }, [pendingRaw])

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

  /**
   * 카톡 → 결정 (Unit C). 대화를 보관하지 않고 **결정만** 건져낸다.
   *
   * 🔴 순서가 개인정보 방어선이다: 범위 슬라이스 → PII 마스킹 → AI 호출.
   *    원문은 이 함수를 벗어나지 않고, 본문에는 AI 요약 3줄만 남는다.
   * 🔴 추출 결과가 비면 `pendingRaw`를 **지우지 않는다** — 지우면 사용자가 붙여넣은 걸 통째로 잃는다.
   */
  const runKakaoExtract = async () => {
    if (!kakao || chatBusy) return
    const today = new Date().toLocaleDateString("en-CA")
    const sliced = sliceRecent(kakao, scope, today)
    if (sliced.segments.length === 0) {
      toast.error(`${SCOPE_LABEL[scope]} 대화가 없어요. 범위를 넓혀 보세요.`)
      return
    }
    setChatBusy(true)
    try {
      const res = await fetch("/api/meeting-notes/extract-decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: maskPii(transcriptToText(sliced, 24000)),
          mode: "chat",
          today,
        }),
      })
      if (!res.ok) throw new Error(res.status === 429 ? await res.text() : "결정을 뽑지 못했어요.")
      const j = (await res.json()) as { decisions: DecisionDraft[]; summary: string | null }
      if (!j.summary && j.decisions.length === 0) {
        toast.error("정해진 것으로 볼 만한 게 없었어요. 범위를 넓히거나 그냥 본문에 붙여넣어 보세요.")
        return // pendingRaw 유지 — 사용자가 다시 선택할 수 있어야 한다
      }
      if (j.summary) {
        editorRef.current?.chain().focus("end").insertContent(linesToContent(j.summary)).run()
      }
      onChatDecisions?.(j.decisions)
      setPendingRaw(null)
      toast.success(
        j.decisions.length > 0
          ? `요약을 본문에 넣었어요. 저장하면 결정 ${j.decisions.length}건을 확인할 수 있어요.`
          : "요약을 본문에 넣었어요. (정해진 것으로 볼 만한 건 없었어요)",
      )
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setChatBusy(false)
    }
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
      {/* ①-a 카톡 감지 배너(Unit C) — 전사가 아니라 **결정만** 건지는 경로. 신규 화면은 만들지 않는다. */}
      {pendingRaw && kakao && (
        <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <MessageSquare className="size-3.5 shrink-0 text-primary" />
            <span className="flex-1">
              <b>카카오톡 대화</b>로 보여요 (발화 {kakao.segments.length}개). 결정만 뽑고 <b>원문은 저장하지 않아요</b>.
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button type="button" size="sm" onClick={runKakaoExtract} disabled={chatBusy}>
                {chatBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Gavel className="size-3.5" />} 결정만 뽑기
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={insertPendingAsText} disabled={chatBusy}>
                그냥 본문에 붙여넣기
              </Button>
              <button onClick={() => setPendingRaw(null)} className="text-muted-foreground hover:text-foreground" aria-label="취소">
                <X className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-muted-foreground">범위:</span>
            {SCOPES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                  scope === s ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {SCOPE_LABEL[s]}
              </button>
            ))}
            <span className="ml-1 text-[10px] text-muted-foreground">
              본문엔 3줄 요약만 남고, 전화번호·계좌·주민번호는 AI에 보내기 전에 가려요.
            </span>
          </div>
        </div>
      )}

      {/* ①-b 전사 감지 배너 — 기본 삽입을 막았으니 반드시 선택지를 준다 */}
      {pendingRaw && !kakao && (
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
