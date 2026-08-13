"use client"

import { useEffect, useState } from "react"
import { Mail, PenSquare } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUserId } from "@/components/auth/CurrentUserProvider"
import { Button } from "@/components/ui/button"
import MailCompose from "./MailCompose"

/**
 * 메일 — 작성·발송 전용 화면.
 *
 * 받은편지함 읽기는 지원하지 않는다: 읽기에 필요한 `gmail.readonly`/`gmail.modify`가 구글
 * **제한(restricted)** 스코프여서 프로덕션 공개 시 CASA Tier 2 연간 보안감사(제3자 감사기관·유료)가
 * 강제된다. 2026-08-12 대표 결정으로 `GOOGLE_SCOPES`를 `gmail.send`(민감)만 남겼고,
 * 읽기 UI(`MailShell`)는 사용 중단했다 — 파일은 보존했으니 되돌릴 때는 `oauth.ts`에 읽기 스코프를
 * 되살리고 `/mail` 페이지를 `MailShell`로 교체하면 된다.
 *
 * 작성창은 기존 `MailCompose`(우하단 플로팅 패널)를 그대로 재사용한다.
 */
export function MailSendView() {
  const supabase = createClient()
  const me = useCurrentUserId()
  const [connected, setConnected] = useState<boolean | null>(null)
  const [googleEmail, setGoogleEmail] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)

  // 연결 상태 조회 — setState는 이펙트 본문이 아니라 `.then` 콜백에서만 한다(react-hooks/set-state-in-effect).
  // Supabase 쿼리 빌더는 lazy thenable이라 `.then`이 붙어야 실제로 전송된다(safe-changes §5).
  // me가 아직 없으면 connected는 null로 남아 "확인 중" 상태가 유지된다((app) 레이아웃이 인증을 보장).
  useEffect(() => {
    if (!me) return
    let cancelled = false
    supabase
      .from("google_connections")
      .select("is_active, google_email")
      .eq("user_id", me)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setConnected(!!data?.is_active)
        setGoogleEmail(data?.google_email ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [supabase, me])

  // 연결 콜백 결과 토스트(MailShell과 동일 규칙 — /api/google/callback이 ?google=…로 돌려보낸다)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("google")
    if (!p) return
    if (p === "connected") toast.success("Gmail이 연결되었어요.")
    else if (p === "error") toast.error("Gmail 연결에 실패했어요. 다시 시도해 주세요.")
    else if (p === "not_configured") toast.error("Google 연동이 아직 설정되지 않았어요(관리자).")
    window.history.replaceState({}, "", window.location.pathname)
  }, [])

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">메일 보내기</h1>
        <p className="mt-1 break-keep text-sm text-muted-foreground">
          본인 Gmail 계정으로 메일을 작성해 보냅니다. 받은편지함 읽기는 지원하지 않습니다.
          {googleEmail ? ` · 연결된 계정 ${googleEmail}` : ""}
        </p>
      </div>

      {connected ? (
        <div className="grid place-items-center rounded-2xl border border-dashed py-16">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-muted">
              <PenSquare className="size-6" />
            </div>
            <p className="text-sm font-semibold">새 메일을 작성해 보내세요</p>
            <p className="break-keep text-xs text-muted-foreground">
              첨부·서식·AI 다듬기를 그대로 쓸 수 있어요. 보낸 메일은 내 Gmail의 보낸편지함에 남습니다.
            </p>
            <Button size="sm" onClick={() => setComposeOpen(true)}>
              새 메일 쓰기
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid place-items-center rounded-2xl border border-dashed py-16">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-muted">
              <Mail className="size-6" />
            </div>
            <p className="text-sm font-semibold">Gmail 연결이 필요합니다</p>
            <p className="break-keep text-xs text-muted-foreground">
              {connected === null
                ? "연결 상태 확인 중…"
                : "내 Gmail을 연결하면 여기서 메일을 작성해 보낼 수 있어요."}
            </p>
            <Button
              size="sm"
              disabled={connected === null}
              onClick={() => {
                window.location.href = "/api/google/connect"
              }}
            >
              내 Gmail 연결
            </Button>
          </div>
        </div>
      )}

      {composeOpen && (
        <MailCompose
          initial={{}}
          onClose={() => setComposeOpen(false)}
          onSent={() => setComposeOpen(false)}
        />
      )}
    </div>
  )
}
