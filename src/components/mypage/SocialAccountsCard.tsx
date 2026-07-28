"use client"

import { useCallback, useEffect, useState } from "react"
import type { UserIdentity } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { GoogleIcon } from "@/components/auth/SocialButtons"
import { Button } from "@/components/ui/button"

const LINK_ERRORS: Record<string, string> = {
  identity_already_exists: "이 구글 계정은 이미 다른 멤버에 연결되어 있어요.",
  access_denied: "구글 계정 연결이 취소되었어요.",
}

/**
 * 마이페이지 '로그인 방법' 카드 — 구글 계정 연결/해제(manual identity linking).
 * 멤버 계정 이메일이 내부 합성 주소(u<hex>@…)라 구글 로그인이 자동 연결되지 않음 →
 * 여기서 수동 연결해야 로그인 화면의 'Google로 계속하기'를 쓸 수 있다.
 * 해제는 다른 로그인 수단(이름+비밀번호)이 남아 있을 때만 허용.
 */
export function SocialAccountsCard() {
  const supabase = createClient()
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUserIdentities()
    setIdentities(data?.identities ?? [])
    // 연결 흐름에서 돌아온 에러 표시(?link_error=코드) — 1회 표시 후 URL 정리
    const linkError = new URLSearchParams(window.location.search).get("link_error")
    if (linkError) {
      setMessage(LINK_ERRORS[linkError] ?? "구글 계정 연결에 실패했어요. 다시 시도해 주세요.")
      window.history.replaceState(null, "", window.location.pathname)
    }
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 연결 현황 로드(McpCredentialsCard 동일 패턴)
    void load()
  }, [load])

  const google = identities?.find((i) => i.provider === "google") ?? null
  const googleEmail =
    google && typeof google.identity_data?.email === "string" ? google.identity_data.email : null

  async function link() {
    setMessage(null)
    setBusy(true)
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/mypage` },
    })
    if (error) {
      setMessage("구글 연결을 시작하지 못했어요. (관리자 설정이 필요할 수 있어요)")
      setBusy(false)
    }
    // 성공 시 구글 동의 화면으로 리다이렉트됨
  }

  async function unlink() {
    if (!google) return
    if (!confirmUnlink) {
      setConfirmUnlink(true)
      return
    }
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.auth.unlinkIdentity(google)
    if (error) setMessage("연결 해제에 실패했어요. 다시 시도해 주세요.")
    else await load()
    setConfirmUnlink(false)
    setBusy(false)
  }

  // 구글이 유일한 로그인 수단이면 해제 금지(잠금 방지)
  const canUnlink = google !== null && (identities?.length ?? 0) > 1

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-medium text-muted-foreground">로그인 방법</h2>
      <div className="flex items-center gap-3 rounded-xl border p-4">
        <GoogleIcon className="size-6 shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold">구글 계정</span>
          <span className="truncate text-xs text-muted-foreground">
            {identities === null
              ? "확인 중..."
              : google
                ? `연결됨${googleEmail ? ` · ${googleEmail}` : ""} — 로그인 화면에서 'Google로 계속하기' 사용 가능`
                : "연결하면 비밀번호 없이 구글로 바로 로그인할 수 있어요."}
          </span>
        </div>
        <div className="ml-auto shrink-0">
          {identities !== null &&
            (google ? (
              canUnlink && (
                <Button variant="outline" size="sm" onClick={unlink} disabled={busy}>
                  {confirmUnlink ? "정말 해제할까요?" : "연결 해제"}
                </Button>
              )
            ) : (
              <Button variant="outline" size="sm" onClick={link} disabled={busy}>
                {busy ? "이동 중..." : "연결하기"}
              </Button>
            ))}
        </div>
      </div>
      {message && <p className="text-sm text-destructive">{message}</p>}
    </div>
  )
}
