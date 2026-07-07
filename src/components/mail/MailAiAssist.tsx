"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import type { Editor } from "@tiptap/react"
import { Sparkles, Mail, Wand2, Scissors, Languages, Loader2, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { JSONContent } from "@/lib/tiptap"

/**
 * 메일 작성 AI 보조 — 초안/요점을 회사 격식 메일로 완성·정중히 다듬기·간결화·번역.
 * /api/google/gmail/assist 스트리밍 → 미리보기 카드 누적 → [적용] 시에만 본문 반영(원문 보존).
 */

type AssistAction = "formal" | "polish" | "concise" | "translate"
type Lang = "en" | "ja" | "zh"
const LANG_LABEL: Record<Lang, string> = { en: "영어", ja: "일본어", zh: "중국어" }

const MENU: Array<
  | { kind: "formal" | "polish" | "concise"; label: string }
  | { kind: "translate"; lang: Lang; label: string }
> = [
  { kind: "formal", label: "회사 격식 메일로" },
  { kind: "polish", label: "정중하게 다듬기" },
  { kind: "concise", label: "간결하게" },
  ...(["en", "ja", "zh"] as Lang[]).map((lang) => ({ kind: "translate" as const, lang, label: `번역 · ${LANG_LABEL[lang]}` })),
]

/** plain 텍스트 → Tiptap 문단 doc(빈 줄 보존). */
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
  if (action === "formal") return "회사 격식 메일로"
  if (action === "polish") return "정중하게 다듬기"
  if (action === "concise") return "간결하게"
  return `번역 · ${LANG_LABEL[lang ?? "en"]}`
}

export function MailAiAssist({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [label, setLabel] = useState("")
  const abortRef = useRef<AbortController | null>(null)

  const run = useCallback(
    async (action: AssistAction, lang?: Lang) => {
      if (!editor) return
      const text = editor.getText().trim()
      if (!text) {
        toast.error("먼저 내용(요점)을 입력하세요.")
        return
      }
      setOpen(false)
      setBusy(true)
      setLabel(headerLabel(action, lang))
      setResult("")
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch("/api/google/gmail/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, action, targetLang: lang }),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          throw new Error(res.status === 401 ? "로그인이 필요합니다." : `AI 다듬기 실패 (${res.status})`)
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
        if ((e as Error)?.name !== "AbortError") {
          toast.error(e instanceof Error ? e.message : "AI 다듬기 중 오류가 발생했어요.")
        }
        setResult(null)
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [editor]
  )

  const apply = useCallback(() => {
    if (!editor || result == null || !result.trim()) return
    editor.commands.setContent(textToDoc(result.trim()), { emitUpdate: true })
    editor.commands.focus("end")
    setResult(null)
  }, [editor, result])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setResult(null)
  }, [])

  const previewOpen = result != null

  return (
    <div className="relative">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn("gap-1.5", (open || previewOpen) && "bg-muted")}
      >
        <Sparkles className="size-3.5 text-primary" />
        AI 다듬기
      </Button>

      {/* 액션 드롭다운 (위로 열림) */}
      {open && !previewOpen && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-1.5 w-48 overflow-hidden rounded-lg border bg-popover py-1 shadow-lg">
            {MENU.map((item, i) => {
              const Icon =
                item.kind === "translate"
                  ? Languages
                  : item.kind === "concise"
                    ? Scissors
                    : item.kind === "polish"
                      ? Wand2
                      : Mail
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

      {/* 미리보기 카드 — 스트리밍 누적, 완료 후 [적용]/[취소] */}
      {previewOpen && (
        <div className="absolute bottom-full left-0 z-20 mb-1.5 w-80 rounded-lg border bg-popover p-2.5 shadow-lg">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3" />
            {label}
            {busy && <Loader2 className="size-3 animate-spin" />}
          </div>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-sm">
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
