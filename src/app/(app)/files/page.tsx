import { FolderOpen } from "lucide-react"
import { PagePlaceholder } from "@/components/shared/PagePlaceholder"

export default function FilesPage() {
  return (
    <PagePlaceholder
      icon={FolderOpen}
      title="파일 관리 (Google Drive 연동)"
      description="DB·화면 골격은 준비됨. 실제 연동은 Google Cloud 설정 후 활성화됩니다."
      phase={6}
      todo={[
        "Google Cloud OAuth 클라이언트 발급 → .env.local에 GOOGLE_CLIENT_ID/SECRET",
        "직원별 구글 계정 연결 (google_connections 테이블에 토큰 저장)",
        "Drive API로 파일 목록 조회 → files 테이블에 메타 캐싱",
        "업로드 / 미리보기 / 새 창에서 열기, 프로젝트(project_id)에 연결",
      ]}
    />
  )
}
