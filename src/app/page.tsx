import type { Metadata } from "next"
import LandingPage from "@/components/landing/LandingPage"

// 공개 랜딩(2026-07-27 공개, 로그인 상태도 열람 가능 2026-07-28).
// SEO: 한국어 검색("컴플로우") 대응 — 제목·설명·JSON-LD에 한글 브랜드 병기.
export const metadata: Metadata = {
  title: "컴플로우 Complow — 회사 업무에 AI를 붙이는 워크스페이스",
  description:
    "컴플로우(Complow)는 AI 에이전트·팀 협업·손익 관리·전자결재까지 회사에 맞게 커스터마이징되는 올인원 AI 업무 플랫폼입니다. 14일 무료 체험.",
  alternates: { canonical: "https://complow.kr" },
  openGraph: {
    title: "컴플로우 Complow — 회사 업무에 AI를 붙이는 워크스페이스",
    description: "AI 에이전트부터 손익 관리까지, 회사에 맞게 커스터마이징되는 업무 플랫폼.",
    url: "https://complow.kr",
    siteName: "Complow",
    locale: "ko_KR",
    type: "website",
    images: [{ url: "/brand/logo-horizontal.png" }],
  },
}

// 구조화 데이터 — 구글이 영문 Complow와 한글 컴플로우를 같은 브랜드로 인식하도록
const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Complow",
  alternateName: ["컴플로우", "컴플로우 워크스페이스"],
  url: "https://complow.kr",
  logo: "https://complow.kr/brand/logo-mark.png",
  email: "complow@complow.kr",
  sameAs: ["https://www.instagram.com/complow/"],
  description: "회사 업무에 AI를 붙이는 올인원 워크스페이스 — AI 에이전트·팀 협업·손익 관리·전자결재.",
}

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }} />
      <LandingPage />
    </>
  )
}
