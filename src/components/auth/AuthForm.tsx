"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { nameToEmail } from "@/lib/auth"
import SocialButtons from "@/components/auth/SocialButtons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type AuthMode = "login" | "signup"

/**
 * 로그인·가입 공용 폼 — (auth) 페이지와 랜딩 모달이 함께 쓴다(로직 단일화).
 * onSwitchMode가 있으면 모달 내 전환(페이지 이동 없음), 없으면 /login·/signup 링크.
 * initialError는 OAuth 콜백이 /login?error=…로 돌려보낸 메시지(페이지에서 매핑해 전달).
 */
export function AuthForm({
  mode,
  onSwitchMode,
  initialError,
}: {
  mode: AuthMode
  onSwitchMode?: (m: AuthMode) => void
  initialError?: string | null
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // 폴백 로그인 접힘 상태 — 기본은 구글 버튼만 노출(가입은 구글 전용이므로 신규 사용자에겐 불필요).
  const [showPasswordLogin, setShowPasswordLogin] = useState(false)

  // 이름+비밀번호 로그인(구글 미연결 기존 계정용 폴백). 가입은 구글 전용이라 signup 분기 없음.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: nameToEmail(name),
        password,
      })
      if (error) {
        setError("이름 또는 비밀번호가 올바르지 않습니다.")
        setLoading(false)
        return
      }
      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? `서버 오류: ${err.message}` : "서버 오류가 발생했습니다.")
      setLoading(false)
    }
  }

  const other: AuthMode = mode === "login" ? "signup" : "login"

  return (
    <div className="w-full">
      {initialError && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2.5 text-center text-sm text-destructive">
          {initialError}
        </p>
      )}
      <SocialButtons />
      {mode === "signup" ? (
        /* 가입 = 구글 전용(대표 결정 2026-07-28) — 이름+공용비번 폼 제거.
           신규 멤버는 관리자가 설정 '구성원 초대'에 구글 이메일을 등록해야 로그인 가능. */
        <p className="mt-5 break-keep rounded-lg bg-muted/60 px-4 py-3 text-center text-[13px] leading-relaxed text-muted-foreground">
          Complow는 구글 계정으로 시작해요.
          <br />
          관리자가 회원님의 구글 이메일을 등록했다면 위 버튼으로 바로 로그인됩니다.
          <br />
          아직이라면 관리자에게 초대를 요청해 주세요.
        </p>
      ) : (
        <>
          {/* 이름+비밀번호 폴백은 기본 접힘. 신규 사용자는 구글(추후 애플)만 쓰고, 구글 미연결
              기존 계정만 펼쳐서 쓴다 — 합성 이메일(u<hex>@equria.local)이라 자동 연결이 불가해
              폼을 제거하면 잠긴다. 2026-08-12 확인: auth.users 7명 중 5명이 구글 미연결(전원 실사용자).
              5명 전원 마이페이지에서 구글 연결을 마치면 이 분기를 통째로 삭제해도 된다. */}
          {!showPasswordLogin && (
            <button
              type="button"
              onClick={() => setShowPasswordLogin(true)}
              className="mx-auto mt-5 block break-keep text-xs text-muted-foreground/70 underline"
            >
              기존 계정(이름·비밀번호)으로 로그인
            </button>
          )}
          {showPasswordLogin && (
          <>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground/60">
            <span className="h-px flex-1 bg-border" />
            또는
            <span className="h-px flex-1 bg-border" />
          </div>
          {/* 이름+비밀번호 로그인 — 구글 미연결 기존 계정용 폴백 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="auth-name">이름</Label>
              <Input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름을 입력하세요." autoComplete="username" required className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-password">비밀번호</Label>
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="h-11"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-11 w-full text-[15px]" disabled={loading}>
              {loading ? "로그인 중..." : "계속"}
            </Button>
          </form>
          </>
          )}
        </>
      )}

      <p className="mt-8 break-keep text-center text-sm text-muted-foreground">
        {mode === "login" ? "신규 사용자이신가요? " : "이미 계정이 있으신가요? "}
        {onSwitchMode ? (
          <button type="button" onClick={() => onSwitchMode(other)} className="font-semibold text-foreground underline">
            {mode === "login" ? "가입하기" : "로그인"}
          </button>
        ) : (
          <Link href={other === "signup" ? "/signup" : "/login"} className="font-semibold text-foreground underline">
            {mode === "login" ? "가입하기" : "로그인"}
          </Link>
        )}
      </p>
      <p className="mx-auto mt-6 max-w-[320px] break-keep text-center text-xs leading-relaxed text-muted-foreground/70">
        계속 진행하면 <Link href="/terms" className="underline">이용약관</Link> 및 <Link href="/privacy" className="underline">개인정보처리방침</Link>을
        이해했으며 이에 동의하는 것으로 간주됩니다.
      </p>
    </div>
  )
}
