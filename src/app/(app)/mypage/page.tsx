import { MyPageView } from "@/components/mypage/MyPageView"

export default function MyPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">마이페이지</h1>
        <p className="text-sm text-muted-foreground">
          내 프로필과 사용 현황, 내가 만든 에이전트를 확인합니다.
        </p>
      </div>
      <MyPageView />
    </div>
  )
}
