"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import type { Editor } from "@tiptap/react"
import { Sparkles, Wand2, SpellCheck, AlignLeft, Languages, Loader2, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { JSONContent } from "@/lib/tiptap"

/**
 * 채팅 컴포저 AI 보조(단계6) — RichComposer 툴바에 끼우는 격리 컴포넌트.
 * editor(Tiptap)를 주입받아 ① 현재 초안 텍스트를 읽고 ② /api/chat/assist 로 다듬기·요약·번역을
 * 스트리밍 요청해 ③ 미리보기 카드에 누적한다. [적용]을 누를 때만 결과를 plain 문단으로 컴포저에 반영
 * → content=plain SSOT 정합(서식은 평문화되지만 다듬기/요약/번역은 본래 평문 산출이라 자연스러움).
 * 원문은 [적용] 전까지 보존 — non-destructive(safe-changes).
 */

type AssistAction = "polish" | "spellcheck" | "summarize" | "translate"
type Lang = "ko" | "en" | "zh" | "ja"

const LANG_LABEL: Record<Lang, string> = { ko: "한국어", en: "영어", zh: "중국어", ja: "일본어" }

/** 메뉴 항목(다듬기·요약 + 번역 4개국어) */
const MENU: Array<
  | { kind: "polish" | "spellcheck" | "summarize"; label: string }
  | { kind: "translate"; lang: Lang; label: string }
> = [
  { kind: "polish", label: "다듬기" },
  { kind: "spellcheck", label: "맞춤법 검사" },
  { kind: "summarize", label: "요약" },
  ...(["en", "zh", "ja", "ko"] as Lang[]).map((lang) => ({
    kind: "translate" as const,
    lang,
    label: `번역 · ${LANG_LABEL[lang]}`,
  })),
]

/** 결과 plain 텍스트 → Tiptap 문단 doc(마크 없음 — 평문 유지). 빈 줄은 빈 문단으로 보존. */
function textToDoc(text: string): JSONContent {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  return {
    type: "doc",
    content: lines.map((line) =>
      line.length ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" }
    ),
  }
}

function headerLabel(action: AssistAction, lang?: Lang): string {
  if (action === "polish") return "다듬기"
  if (action === "spellcheck") return "맞춤법 검사"
  if (action === "summarize") return "요약"
  return `번역 · ${LANG_LABEL[lang ?? "en"]}`
}

export function ComposerAiAssist({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null) // null=닫힘, ""~=미리보기 표시
  const [label, setLabel] = useState("")
  const abortRef = useRef<AbortController | null>(null)

  const run = useCallback(
    async (action: AssistAction, lang?: Lang) => {
      if (!editor) return
      const text = editor.getText().trim()
      if (!text) {
        toast.error("먼저 메시지를 입력하세요.")
        return
      }
      setOpen(false)
      setBusy(true)
      setLabel(headerLabel(action, lang))
      setResult("")
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch("/api/chat/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, action, targetLang: lang }),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          throw new Error(res.status === 401 ? "로그인이 필요합니다." : `AI 보조 실패 (${res.status})`)
        }
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let acc = ""
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          acc += dec.decode(value, { stream: true })
          setResult(acc)
        }
        if (!acc.trim()) {
          setResult(null)
          toast.error("결과가 비어 있어요. 다시 시도해 주세요.")
        }
      } catch (e) {
        // 사용자가 취소(abort)한 경우엔 조용히 닫는다
        if ((e as Error)?.name !== "AbortError") {
          toast.error(e instanceof Error ? e.message : "AI 보조 중 오류가 발생했어요.")
        }
        setResult(null)
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [editor]
  )

  // [적용] — 결과를 컴포저에 반영(평문 문단). 이때만 원문이 대체된다.
  const apply = useCallback(() => {
    if (!editor || result == null || !result.trim()) return
    editor.commands.setContent(textToDoc(result.trim()))
    editor.commands.focus("end")
    setResult(null)
  }, [editor, result])

  // [취소] — 진행 중이면 스트림 중단, 미리보기 폐기. 원문은 그대로 보존.
  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setResult(null)
  }, [])

  const previewOpen = result != null

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="AI 보조"
        aria-pressed={open || previewOpen}
        title="AI 보조 — 다듬기·요약·번역"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50",
          (open || previewOpen) && "bg-muted text-foreground"
        )}
      >
        <Sparkles className="size-3.5" />
      </button>

      {/* 액션 드롭다운 */}
      {open && !previewOpen && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 z-20 mb-1.5 w-44 overflow-hidden rounded-lg border bg-popover py-1 shadow-lg">
            {MENU.map((item, i) => {
              const Icon =
                item.kind === "translate"
                  ? Languages
                  : item.kind === "summarize"
                    ? AlignLeft
                    : item.kind === "spellcheck"
                      ? SpellCheck
                      : Wand2
              const isFirstTranslate = item.kind === "translate" && MENU[i - 1]?.kind !== "translate"
              return (
                <div key={item.kind === "translate" ? `t-${item.lang}` : item.kind}>
                  {isFirstTranslate && <div className="my-1 h-px bg-border" />}
                  <button
                    type="button"
                    onClick={() => (item.kind === "translate" ? run("translate", item.lang) : run(item.kind))}
                    className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    {item.label}
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* 결과 미리보기 카드 — 스트리밍 중에는 토큰 누적, 완료 후 [적용]/[취소] */}
      {previewOpen && (
        <div className="absolute bottom-full right-0 z-20 mb-1.5 w-72 rounded-lg border bg-popover p-2.5 shadow-lg">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3" />
            {label}
            {busy && <Loader2 className="size-3 animate-spin" />}
          </div>
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm">
            {result || <span className="text-muted-foreground">생성 중…</span>}
          </div>
          <div className="mt-2 flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" onClick={cancel}>
              <X className="size-3.5" />
              취소
            </Button>
            <Button type="button" size="sm" onClick={apply} disabled={busy || !result?.trim()}>
              <Check className="size-3.5" />
              적용
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
