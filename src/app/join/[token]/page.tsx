import { createClient } from "@/lib/supabase/server"
import { JoinView } from "@/components/onboarding/JoinView"

// B2 — 초대 링크 랜딩(/join/<토큰>). 프록시 OPEN_PATHS라 미로그인도 접근 가능.
// 미리보기는 anon 허용 RPC(get_invite_preview — 워크스페이스명·역할·유효 여부만).
// 수락은 로그인 + 명시적 버튼 클릭으로만(프리페치·봇의 use_count 소모 방지).
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: preview } = await supabase.rpc("get_invite_preview", { p_token: token })
  const p = preview?.[0] ?? null

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <JoinView
        token={token}
        loggedIn={!!user}
        workspaceName={p?.workspace_name ?? null}
        inviteRole={p?.invite_role ?? null}
        valid={p?.valid ?? false}
      />
    </div>
  )
}
