import { redirect } from "next/navigation"

// 초안 랜딩페이지는 아직 비공개 — 다듬은 뒤 공개 예정.
// (LandingPage 컴포넌트는 보존; 여기서 렌더만 하지 않음)
export default function Home() {
  redirect("/dashboard")
}
