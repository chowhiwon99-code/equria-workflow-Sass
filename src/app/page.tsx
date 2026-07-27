import type { Metadata } from "next"
import LandingPage from "@/components/landing/LandingPage"

// 공개 랜딩(2026-07-27 공개) — 로그인 상태는 proxy가 /dashboard로 보냄.
export const metadata: Metadata = {
  title: "Complow — 회사 업무에 AI를 붙이는 워크스페이스",
  description: "AI 에이전트·팀 협업·손익 관리까지, 회사에 맞게 커스터마이징되는 AI 업무 플랫폼 컴플로우.",
}

export default function Home() {
  return <LandingPage />
}
