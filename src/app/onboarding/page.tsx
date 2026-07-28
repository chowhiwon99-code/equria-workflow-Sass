import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { OnboardingView } from "@/components/onboarding/OnboardingView"

// B2 온보딩 — 멤버십 없는 로그인 유저의 첫 화면((app) 레이아웃이 여기로 보냄).
// (app) 밖 독립 라우트: 사이드바 없는 미니 레이아웃(리다이렉트 루프 방지).
// ?new=1 = 기존 멤버가 워크스페이스 전환기에서 "새 워크스페이스 만들기"로 진입(추가 회사 생성 허용).
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { new: wantNew } = await searchParams
  if (wantNew !== "1") {
    // 이미 멤버십이 있으면 대시보드로(직접 URL 진입 케이스). 추가 생성은 ?new=1로만.
    const { data: mem } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()
    if (mem) redirect("/dashboard")
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <OnboardingView />
    </div>
  )
}
