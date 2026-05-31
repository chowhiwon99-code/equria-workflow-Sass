// MCP 커넥터 큐레이션 카탈로그 (SSOT). 직원 자유 연결이 아니라 큐레이션된 카탈로그만 노출.

export type Connector = {
  id: string
  name: string
  description: string
  emoji: string
  status: "available" | "coming_soon"
}

export const MCP_CONNECTORS: Connector[] = [
  { id: "google", name: "Google Workspace", description: "Gmail·Drive·Calendar 연동", emoji: "🗂️", status: "coming_soon" },
  { id: "higgsfield", name: "Higgsfield", description: "이미지·영상 생성 → 바로 제작", emoji: "🎬", status: "coming_soon" },
  { id: "supabase", name: "Supabase", description: "데이터 조회(큐레이션된 범위)", emoji: "🟢", status: "coming_soon" },
  { id: "figma", name: "Figma", description: "디자인 파일·코드 커넥트", emoji: "🎨", status: "coming_soon" },
]
