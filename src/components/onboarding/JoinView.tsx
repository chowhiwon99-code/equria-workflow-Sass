"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import SocialButtons from "@/components/auth/SocialButtons"
import { writeActiveWsCookie } from "@/lib/workspace-cookie"

const LINK_ERRORS: Record<string, string> = {
  signup_disabled: "아직 가입이 열리지 않았어요. 관리자에게 계정 등록을 요청해 주세요.",
  access_denied: "구글 로그인이 취소되었어요.",
}

/**
 * 초대 수락 화면 — 미로그인: 구글 로그인(next로 복귀) / 로그인: "참여하기" 버튼 → accept RPC.
 * 콜백 에러는 ?link_error=코드 로 돌아옴(auth/callback의 next 흐름).
 */
export function JoinView({
  token,
  loggedIn,
  workspaceName,
  inviteRole,
  valid,
}: {
  token: string
  loggedIn: boolean
  workspaceName: string | null
  inviteRole: string | null
  valid: boolean
}) {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const linkError = new URLSearchParams(window.location.search).get("link_error")
    if (linkError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 콜백 에러 표시
      setError(LINK_ERRORS[linkError] ?? "구글 로그인에 실패했어요. 다시 시도해 주세요.")
      window.history.replaceState(null, "", window.location.pathname)
    }
  }, [])

  const accept = async () => {
    setBusy(true)
    setError(null)
    const { data, error: e } = await supabase.rpc("accept_workspace_invite", { p_token: token })
    if (e) {
      setError(
        /seat limit/i.test(e.message)
          ? "이 워크스페이스는 요금제 인원이 가득 찼어요. 관리자에게 상위 요금제 업그레이드를 요청해 주세요."
          : /invalid or expired/i.test(e.message)
            ? "만료되었거나 회수된 초대예요. 관리자에게 새 링크를 요청해 주세요."
            : "참여에 실패했어요. 다시 시도해 주세요.",
      )
      setBusy(false)
      return
    }
    // 참여한 회사를 활성 워크스페이스로
    const joinedId = (data as { workspace_id?: string } | null)?.workspace_id
    if (joinedId) writeActiveWsCookie(joinedId)
    window.location.assign("/dashboard")
  }

  if (!workspaceName || !valid) {
    return (
      <div className="w-full max-w-[400px] text-center">
        <h1 className="text-[22px] font-bold tracking-tight">유효하지 않은 초대예요</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          링크가 만료되었거나 회수되었어요. 워크스페이스 관리자에게 새 초대 링크를 요청해 주세요.
        </p>
      </div>
    )
  }

  const roleLabel = inviteRole === "guest" ? "게스트(초대된 프로젝트만 접근)" : inviteRole === "owner" ? "관리자(호스트)" : "멤버"

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-8 text-center">
        <p className="text-sm text-muted-foreground">워크스페이스 초대</p>
        <h1 className="mt-1 text-[24px] font-bold leading-tight tracking-tight">{workspaceName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <b className="text-foreground">{roleLabel}</b>로 초대받았어요.
        </p>
      </div>

      {loggedIn ? (
        <Button onClick={accept} disabled={busy} className="h-11 w-full text-[15px]">
          {busy ? "참여 중..." : `${workspaceName}에 참여하기`}
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-center text-sm text-muted-foreground">참여하려면 먼저 로그인하세요.</p>
          <SocialButtons next={`/join/${token}`} />
        </div>
      )}

      {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}
    </div>
  )
}
