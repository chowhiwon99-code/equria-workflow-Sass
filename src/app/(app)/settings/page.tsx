import { Settings } from "lucide-react"
import { PagePlaceholder } from "@/components/shared/PagePlaceholder"

export default function SettingsPage() {
  return (
    <PagePlaceholder
      icon={Settings}
      title="설정"
      description="프로필 및 워크스페이스 설정"
      phase={1}
      todo={[
        "프로필 이름/부서/아바타 수정",
        "관리자: 공용 비밀번호·에이전트 관리",
      ]}
    />
  )
}
