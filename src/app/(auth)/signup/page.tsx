"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { nameToEmail } from "@/lib/auth"
import { signupAction } from "../actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function SignupPage() {
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
      // 1) 서버에서 공용 비밀번호 검증 + 계정 생성
      const result = await signupAction(name, password)
      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      // 2) 생성 직후 바로 로그인
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: nameToEmail(name),
        password,
      })
      if (error) {
        // 가입은 됐으나 자동 로그인 실패 → 로그인 페이지로
        router.push("/login")
        return
      }

      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      setError(
        err instanceof Error
          ? `서버 오류가 발생했습니다: ${err.message}`
          : "서버 오류가 발생했습니다. 관리자에게 문의하세요."
      )
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>가입하기</CardTitle>
        <CardDescription>
          이름과 공용 비밀번호를 입력하면 가입됩니다.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">이름</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">공용 비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="관리자에게 받은 비밀번호"
              autoComplete="new-password"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="mt-4 flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "가입 중..." : "가입하고 시작하기"}
          </Button>
          <p className="text-sm text-muted-foreground">
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="font-medium text-foreground underline">
              로그인
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
