import { Plug } from "lucide-react"
import { PagePlaceholder } from "@/components/shared/PagePlaceholder"

export default function McpPage() {
  return (
    <PagePlaceholder
      icon={Plug}
      title="MCP 연결"
      description="Google Workspace 등 외부 도구 연결"
      phase={5}
      todo={[
        "연결된 MCP 서버 목록 (mcp_servers)",
        "Google Workspace / Supabase 등 연결 추가",
        "에이전트에 MCP 도구 부여",
      ]}
    />
  )
}
