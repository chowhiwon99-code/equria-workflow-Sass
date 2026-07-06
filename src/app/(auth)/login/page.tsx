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

export default function LoginPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
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
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-8 text-center">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
          나만의 AI 워크스페이스
        </h1>
        <p className="text-[26px] font-bold leading-tight tracking-tight text-muted-foreground/70">
          Complow 계정에 로그인
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">이름</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름을 입력하세요." autoComplete="username" required className="h-11" />
          <p className="text-xs text-muted-foreground">조직에서 사용하는 이름으로 팀원들과 협업하세요.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">비밀번호</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="h-11" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11 w-full text-[15px]" disabled={loading}>
          {loading ? "로그인 중..." : "계속"}
        </Button>
      </form>

      <div className="my-7 flex items-center gap-3 text-[13px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />또는 다음으로 계속하기<span className="h-px flex-1 bg-border" />
      </div>

      <SocialButtons />

      <p className="mt-8 text-center text-sm text-muted-foreground">
        신규 사용자이신가요?{" "}
        <Link href="/signup" className="font-semibold text-foreground underline">가입하기</Link>
      </p>
      <p className="mx-auto mt-6 max-w-[320px] text-center text-xs leading-relaxed text-muted-foreground/70">
        계속 진행하면 <a href="#" className="underline">이용약관</a> 및 <a href="#" className="underline">개인정보 보호정책</a>을
        이해했으며 이에 동의하는 것으로 간주됩니다.
      </p>
    </div>
  )
}
