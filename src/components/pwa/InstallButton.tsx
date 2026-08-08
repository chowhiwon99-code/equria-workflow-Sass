"use client"

// 앱 설치 버튼 — 브라우저가 설치를 지원할 때만 뜬다.
// Chrome/Edge(데스크톱·안드로이드)는 beforeinstallprompt로 네이티브 설치 창을 띄울 수 있지만,
// iOS Safari는 이 이벤트 자체가 없어 '홈 화면에 추가'를 사람이 눌러야 한다 → 그 경우 버튼 대신 안내를 보여준다.
import { useEffect, useState } from "react"
import { Download, Check } from "lucide-react"

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function InstallButton() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null)
  // 이미 설치된 상태로 열렸는지(독립 창)는 effect가 아니라 초기값으로 판단한다 —
  // effect 안에서 동기 setState하면 렌더가 한 번 더 돌고, 버튼이 깜빡였다 사라진다.
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia?.("(display-mode: standalone)").matches) {
      // 이미 설치됨 — 다음 프레임에 반영해 캐스케이딩 렌더를 피한다.
      queueMicrotask(() => setInstalled(true))
      return
    }
    const onPrompt = (e: Event) => {
      e.preventDefault() // 브라우저 기본 배너를 막고 우리 버튼으로 유도
      setDeferred(e as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (installed) {
    return (
      <p className="inline-flex items-center gap-2 rounded-lg border border-emerald-600/20 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-400">
        <Check className="size-4" />
        이미 설치되어 있어요
      </p>
    )
  }

  // 지원하지 않는 브라우저(iOS Safari·Firefox 등)에서는 버튼을 만들지 않는다 —
  // 눌러도 아무 일 없는 버튼보다 아래의 수동 안내가 정직하다.
  if (!deferred) return null

  return (
    <button
      onClick={async () => {
        await deferred.prompt()
        await deferred.userChoice
        setDeferred(null)
      }}
      className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
    >
      <Download className="size-4" />
      지금 설치하기
    </button>
  )
}
