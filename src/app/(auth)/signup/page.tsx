import { AuthForm } from "@/components/auth/AuthForm"

// 직접 접속용 가입 페이지 — 랜딩에서는 같은 폼이 노션식 모달(AuthModal)로 뜬다.
export default function SignupPage() {
  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-8 text-center">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
          나만의 AI 워크스페이스
        </h1>
        <p className="text-[26px] font-bold leading-tight tracking-tight text-muted-foreground/70">
          Complow 시작하기
        </p>
      </div>
      <AuthForm mode="signup" />
    </div>
  )
}
