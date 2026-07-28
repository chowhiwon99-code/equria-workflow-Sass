"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

export function GoogleIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  )
}

/** 구글 로그인 버튼 — 로그인·가입 폼 공용(랜딩 모달 포함).
 *  기존 멤버는 계정 이메일이 내부 합성 주소라 자동 연결이 안 됨 →
 *  마이페이지 '로그인 방법'에서 구글 계정을 연결한 뒤부터 사용 가능.
 *  (애플·카카오는 B6 포장 단계에 추가 예정 — 구 3버튼 UI는 git 히스토리 참조) */
export default function SocialButtons() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signInGoogle() {
    setError(null)
    setPending(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError("구글 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.")
      setPending(false)
    }
    // 성공 시 구글로 리다이렉트되므로 pending 유지
  }

  return (
    <div>
      <button
        type="button"
        onClick={signInGoogle}
        disabled={pending}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
      >
        <GoogleIcon />
        {pending ? "구글로 이동 중..." : "Google로 계속하기"}
      </button>
      {error && <p className="pt-3 text-center text-sm text-destructive">{error}</p>}
    </div>
  )
}
