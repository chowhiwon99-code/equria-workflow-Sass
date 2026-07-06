"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

type Provider = "google" | "kakao" | "apple"
const LABEL: Record<Provider, string> = { google: "구글", kakao: "카카오", apple: "Apple" }

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  )
}
function KakaoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="currentColor">
      <path d="M12 3.4c-4.97 0-9 3.13-9 6.99 0 2.5 1.68 4.69 4.2 5.92-.14.5-.9 3.1-.93 3.3 0 0-.02.16.09.22.1.06.22.02.22.02.29-.04 3.36-2.2 3.94-2.6.47.07.96.1 1.49.1 4.97 0 9-3.13 9-6.98S16.97 3.4 12 3.4Z" />
    </svg>
  )
}
function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="currentColor">
      <path d="M17.05 12.04c-.03-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.75 2.28-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.29 1.15-.05 1.58-.74 2.97-.74 1.39 0 1.78.74 3 .72 1.24-.02 2.02-1.12 2.78-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65ZM14.77 5.3c.64-.77 1.07-1.85.95-2.92-.92.04-2.03.61-2.69 1.38-.59.68-1.11 1.77-.97 2.82 1.02.08 2.07-.52 2.71-1.28Z" />
    </svg>
  )
}

const CARD =
  "flex flex-col items-center justify-center gap-2 rounded-xl border py-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"

/** 소셜 로그인 카드 그리드(구글·애플·카카오). 로그인·회원가입 공용.
 *  OAuth 제공자 설정 전이면 클릭 시 안내 메시지 노출(백엔드 연결은 별도). */
export default function SocialButtons() {
  const [pending, setPending] = useState<Provider | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function signIn(p: Provider) {
    setError(null)
    setPending(p)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: p,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(`${LABEL[p]} 로그인을 시작하지 못했어요. (제공자 설정이 필요할 수 있어요)`)
      setPending(null)
    }
  }

  const busy = pending !== null
  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5">
        <button type="button" onClick={() => signIn("google")} disabled={busy} className={CARD}>
          <GoogleIcon /> Google
        </button>
        <button type="button" onClick={() => signIn("apple")} disabled={busy} className={CARD}>
          <AppleIcon /> Apple
        </button>
        <button type="button" onClick={() => signIn("kakao")} disabled={busy} className={CARD}>
          <KakaoIcon /> 카카오
        </button>
      </div>
      {error && <p className="pt-3 text-center text-sm text-destructive">{error}</p>}
    </div>
  )
}
