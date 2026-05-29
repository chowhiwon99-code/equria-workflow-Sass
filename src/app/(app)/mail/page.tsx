import { Mail } from "lucide-react"
import { PagePlaceholder } from "@/components/shared/PagePlaceholder"

export default function MailPage() {
  return (
    <PagePlaceholder
      icon={Mail}
      title="메일 (Gmail 연동)"
      description="DB·화면 골격은 준비됨. 실제 연동은 Google Cloud 설정 후 활성화됩니다."
      phase={6}
      todo={[
        "Gmail API 활성화 + scope gmail.readonly (발송 시 gmail.send)",
        "직원별 구글 계정 연결 (google_connections 공용 — Drive와 동일 토큰)",
        "받은 메일 목록/검색, 새 메일 수신 시 알림(notifications type='mail') 생성",
        "회사 메일 계정도 동일 방식으로 연결",
      ]}
    />
  )
}
