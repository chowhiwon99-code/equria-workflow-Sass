"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Sparkles, ListChecks, Wand2, Plus, RefreshCw, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

type Action = "summarize" | "actions" | "polish"

const ACTIONS: { key: Action; label: string; icon: typeof Sparkles }[] = [
  { key: "summarize", label: "요약", icon: Sparkles },
  { key: "actions", label: "액션아이템", icon: ListChecks },
  { key: "polish", label: "정리", icon: Wand2 },
]

/**
 * 회의록 에디터 옆 상시 AI 보조. 현재 본문을 /api/meeting-notes/assist로 보내
 * 요약/액션아이템/정리 결과를 스트리밍으로 받아 미리보기에 누적하고,
 * 사용자가 [본문에 추가]/[전체 교체]할 때만 본문에 반영한다(직접 저장 안 함).
 */
export function MeetingAiAssist({
  getText,
  onAppend,
  onReplace,
  disabled,
}: {
  getText: () => string
  onAppend: (text: string) => void
  onReplace: (text: string) => void
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState<Action | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const run = useCallback(
    async (action: Action) => {
      const text = getText().trim()
      if (!text) {
        toast.error("회의 내용을 먼저 입력해 주세요.")
        return
      }
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setBusy(true)
      setActive(action)
      setResult("")
      try {
        const res = await fetch("/api/meeting-notes/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, action }),
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
      } catch (e) {
        if ((e as Error).name === "AbortError") return
        toast.error((e as Error).message || "AI 보조에 실패했어요.")
        setResult(null)
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [getText]
  )

  // 언마운트(에디터에서 목록으로 이탈 등) 시 진행 중 스트림 중단 — 누수 방지.
  useEffect(() => () => abortRef.current?.abort(), [])

  const close = useCallback(() => {
    abortRef.current?.abort()
    setResult(null)
    setActive(null)
  }, [])

  const append = useCallback(() => {
    if (result?.trim()) onAppend(result.trim())
    close()
  }, [result, onAppend, close])

  const replace = useCallback(() => {
    if (!result?.trim()) {
      close()
      return
    }
    // 파괴적 동작: 기존 본문이 있으면 한 번 확인(되돌리기 없음).
    if (getText().trim() && !confirm("현재 본문을 AI 결과로 덮어쓸까요? 기존 내용은 사라집니다.")) return
    onReplace(result.trim())
    close()
  }, [result, onReplace, close, getText])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Sparkles className="size-3" /> AI 보조
        </span>
        {ACTIONS.map((a) => {
          const Icon = a.icon
          return (
            <Button
              key={a.key}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy}
              onClick={() => run(a.key)}
            >
              {busy && active === a.key ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
              {a.label}
            </Button>
          )
        })}
      </div>

      {result !== null && (
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">
              {ACTIONS.find((a) => a.key === active)?.label} 결과 (미리보기)
            </span>
            <button onClick={close} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-sm">
            {result || <span className="text-muted-foreground">생성 중…</span>}
          </div>
          <div className="mt-2.5 flex justify-end gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={append} disabled={busy || !result.trim()}>
              <Plus className="size-3.5" /> 본문에 추가
            </Button>
            <Button type="button" size="sm" onClick={replace} disabled={busy || !result.trim()}>
              <RefreshCw className="size-3.5" /> 전체 교체
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
