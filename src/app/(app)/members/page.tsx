import { MembersView } from "@/components/members/MembersView"

export default function MembersPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">구성원</h1>
        <p className="text-sm text-muted-foreground">부서·직급별 구성원과 공개된 연락처를 확인합니다.</p>
      </div>
      <MembersView />
    </div>
  )
}
