"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { nameToEmail } from "@/lib/auth"
import { signupAction } from "@/app/(auth)/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type AuthMode = "login" | "signup"

/**
 * 로그인·가입 공용 폼 — (auth) 페이지와 랜딩 모달이 함께 쓴다(로직 단일화).
 * onSwitchMode가 있으면 모달 내 전환(페이지 이동 없음), 없으면 /login·/signup 링크.
 */
export function AuthForm({ mode, onSwitchMode }: { mode: AuthMode; onSwitchMode?: (m: AuthMode) => void }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === "signup") {
        const result = await signupAction(name, password)
        if (result.error) {
          setError(result.error)
          setLoading(false)
          return
        }
      }
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: nameToEmail(name),
        password,
      })
      if (error) {
        if (mode === "signup") {
          router.push("/login")
          return
        }
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="auth-name">이름</Label>
          <Input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름을 입력하세요." autoComplete="username" autoFocus required className="h-11" />
          <p className="text-xs text-muted-foreground">조직에서 사용하는 이름으로 팀원들과 협업하세요.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="auth-password">{mode === "login" ? "비밀번호" : "공용 비밀번호"}</Label>
          <Input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "관리자에게 받은 비밀번호" : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            className="h-11"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11 w-full text-[15px]" disabled={loading}>
          {loading ? (mode === "login" ? "로그인 중..." : "가입 중...") : "계속"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
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
      <p className="mx-auto mt-6 max-w-[320px] text-center text-xs leading-relaxed text-muted-foreground/70">
        계속 진행하면 <Link href="/terms" className="underline">이용약관</Link> 및 <Link href="/privacy" className="underline">개인정보처리방침</Link>을
        이해했으며 이에 동의하는 것으로 간주됩니다.
      </p>
    </div>
  )
}
