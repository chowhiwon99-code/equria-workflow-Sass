import { AuthForm } from "@/components/auth/AuthForm"

// OAuth 콜백(/auth/callback)이 실패 시 ?error=코드 로 돌려보낸다 → 사용자 문구로 매핑.
const OAUTH_ERRORS: Record<string, string> = {
  oauth: "구글 로그인에 실패했어요. 다시 시도해 주세요.",
  oauth_cancelled: "구글 로그인이 취소되었어요.",
  signup_disabled:
    "이 구글 계정으로 등록된 멤버가 없어요. 관리자에게 구글 이메일 초대를 요청해 주세요.",
}

// 직접 접속용 로그인 페이지 — 랜딩에서는 같은 폼이 노션식 모달(AuthModal)로 뜬다.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const initialError = error ? (OAUTH_ERRORS[error] ?? OAUTH_ERRORS.oauth) : null

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
      <AuthForm mode="login" initialError={initialError} />
    </div>
  )
}
