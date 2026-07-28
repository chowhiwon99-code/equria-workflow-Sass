"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Link2, LogOut } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { writeActiveWsCookie } from "@/lib/workspace-cookie"

/** 초대 링크/토큰에서 토큰만 추출 — 전체 URL을 붙여넣어도 동작. */
function parseInviteToken(input: string): string | null {
  const t = input.trim()
  if (!t) return null
  const m = t.match(/\/join\/([A-Za-z0-9_-]{20,})/)
  if (m) return m[1]
  if (/^[A-Za-z0-9_-]{20,}$/.test(t)) return t
  return null
}

/**
 * B2 온보딩 — "새 워크스페이스 만들기"(create_workspace RPC) / "초대 링크로 참여" 2카드.
 * 노션·슬랙 방식: 가입한 유저가 자기 회사를 만들거나, 받은 링크로 기존 회사에 합류.
 */
export function OnboardingView() {
  const router = useRouter()
  const supabase = createClient()
  const [mode, setMode] = useState<"pick" | "create" | "join">("pick")
  const [name, setName] = useState("")
  const [invite, setInvite] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createWorkspace = async () => {
    const nm = name.trim()
    if (!nm) return setError("워크스페이스(회사) 이름을 입력해 주세요.")
    setBusy(true)
    setError(null)
    const { data, error: e } = await supabase.rpc("create_workspace", { p_name: nm })
    if (e) {
      setError("워크스페이스를 만들지 못했어요. 잠시 후 다시 시도해 주세요.")
      setBusy(false)
      return
    }
    // 방금 만든 회사를 활성 워크스페이스로(전환기·RLS 헤더 정합)
    const newId = (data as { id?: string } | null)?.id
    if (newId) writeActiveWsCookie(newId)
    window.location.assign("/dashboard")
  }

  const goJoin = () => {
    const token = parseInviteToken(invite)
    if (!token) return setError("초대 링크(또는 코드)가 올바르지 않아요.")
    router.push(`/join/${token}`)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.replace("/login")
    router.refresh()
  }

  return (
    <div className="w-full max-w-[440px]">
      <div className="mb-8 text-center">
        <h1 className="text-[24px] font-bold leading-tight tracking-tight">Complow 시작하기</h1>
        <p className="mt-1 text-sm text-muted-foreground">회사 워크스페이스를 만들거나, 초대받은 곳에 참여하세요.</p>
      </div>

      {mode === "pick" && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setMode("create")}
            className="flex items-center gap-4 rounded-xl border p-5 text-left transition-colors hover:bg-muted/50"
          >
            <Building2 className="size-6 shrink-0 text-muted-foreground" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">새 워크스페이스 만들기</span>
              <span className="text-xs text-muted-foreground">우리 회사의 AI 워크스페이스를 새로 시작해요. 기본 에이전트가 함께 준비됩니다.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className="flex items-center gap-4 rounded-xl border p-5 text-left transition-colors hover:bg-muted/50"
          >
            <Link2 className="size-6 shrink-0 text-muted-foreground" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">초대 링크로 참여하기</span>
              <span className="text-xs text-muted-foreground">관리자에게 받은 초대 링크를 붙여넣으면 팀에 합류해요.</span>
            </span>
          </button>
        </div>
      )}

      {mode === "create" && (
        <div className="flex flex-col gap-4 rounded-xl border p-5">
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">워크스페이스 이름</Label>
            <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="회사·팀 이름 (예: 컴플로우)" autoFocus className="h-11" />
          </div>
          <Button onClick={createWorkspace} disabled={busy} className="h-11 w-full">
            {busy ? "만드는 중..." : "워크스페이스 만들기"}
          </Button>
          <button type="button" onClick={() => { setMode("pick"); setError(null) }} className="text-center text-xs text-muted-foreground underline">
            뒤로
          </button>
        </div>
      )}

      {mode === "join" && (
        <div className="flex flex-col gap-4 rounded-xl border p-5">
          <div className="space-y-1.5">
            <Label htmlFor="ws-invite">초대 링크</Label>
            <Input id="ws-invite" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="https://complow.kr/join/..." autoFocus className="h-11" />
          </div>
          <Button onClick={goJoin} className="h-11 w-full">참여하기</Button>
          <button type="button" onClick={() => { setMode("pick"); setError(null) }} className="text-center text-xs text-muted-foreground underline">
            뒤로
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}

      <button
        type="button"
        onClick={signOut}
        className="mx-auto mt-8 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <LogOut className="size-3.5" /> 다른 계정으로 로그인
      </button>
    </div>
  )
}
