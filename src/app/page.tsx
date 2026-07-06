import type { Metadata } from "next"
import LandingPage from "@/components/landing/LandingPage"

export const metadata: Metadata = {
  title: "Complow — 회사의 일을 AI로 흐르게",
  description: "AI 에이전트·팀 협업·현금흐름까지, 사내 업무를 하나의 AI 워크스페이스로. Complow.",
}

export default function Home() {
  return <LandingPage />
}
