"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

export type AiAction = "summarize" | "actions" | "polish"

export const AI_ACTION_LABEL: Record<AiAction, string> = {
  summarize: "요약",
  actions: "액션아이템",
  polish: "정리",
}

/**
 * 회의록 AI 보조 스트리밍 훅 — 상시 버튼과 `/` 슬래시 메뉴가 같은 흐름을 공유한다.
 * 현재 본문(getText)을 /api/meeting-notes/assist로 보내 결과를 누적(result)하고,
 * 호출부가 [추가]/[교체]로 본문에 반영한다(직접 저장 안 함). 언마운트 시 스트림 중단.
 */
export function useMeetingAi(getText: () => string) {
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState<AiAction | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const run = useCallback(
    async (action: AiAction) => {
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

  const close = useCallback(() => {
    abortRef.current?.abort()
    setResult(null)
    setActive(null)
  }, [])

  return { busy, active, result, run, close }
}
