import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/layout/Sidebar"
import { Header } from "@/components/layout/Header"
import { AnnouncementBanner } from "@/components/layout/AnnouncementBanner"
import { AgentChatProvider } from "@/components/agent-chat/AgentChatContext"
import { FloatingAgentChat } from "@/components/agent-chat/FloatingAgentChat"
import { UndoProvider } from "@/components/undo/UndoProvider"
import { CurrentUserProvider } from "@/components/auth/CurrentUserProvider"
import { PageTransition } from "@/components/layout/PageTransition"
import { Toaster } from "@/components/ui/sonner"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 미들웨어가 1차 가드하지만, 레이아웃에서도 방어적으로 확인한다.
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single()

  return (
    <CurrentUserProvider userId={user.id}>
      <UndoProvider>
      <AgentChatProvider>
        {/* dvh: iOS 사파리 주소창이 가리는 만큼 실시간 보정(데스크톱은 vh와 동일) */}
        <div className="flex h-dvh overflow-hidden">
          {/* 앰비언트 배경 — 프로스트 글래스가 블러할 은은한 그라데이션. fixed·-z-10라 flex 흐름 불참(레이아웃 무영향) */}
          <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 app-ambient" />
          {/* 모바일(<md)에선 숨김 — 대신 Header의 MobileNav 드로어로 진입. 배지 구독도 md+에서만 */}
          <Sidebar className="hidden md:flex" badgeDesktopOnly />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header userName={profile?.name ?? "직원"} userId={user.id} />
            <AnnouncementBanner />
            <main className="flex-1 overflow-y-auto p-[var(--app-pad)]">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </div>
        <FloatingAgentChat />
        <Toaster />
      </AgentChatProvider>
      </UndoProvider>
    </CurrentUserProvider>
  )
}
