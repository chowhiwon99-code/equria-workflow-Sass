import { Loading } from "@/components/shared/States"

// 라우트 전환 시 즉시 표시되는 Suspense 스켈레톤.
// loading.tsx가 없으면 새 페이지의 RSC가 준비될 때까지 이전 화면이 멈춰 "클릭 후 버벅" 체감 → 이 파일로 즉시 피드백.
export default function AppLoading() {
  return <Loading rows={8} />
}
